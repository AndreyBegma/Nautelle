import type { CreateApiTokenRequest, CreatedApiToken } from '@nautelle/shared';
import { BoardWorld } from '../board/testing/board-e2e';
import type { Session } from '../test/e2e-app';
import { hashToken } from './tokens';

// C-403: personal API tokens — `Authorization: Bearer` on the REST API.
describe('Personal API tokens (e2e)', () => {
  const w = new BoardWorld();

  beforeAll(() => w.init());
  afterAll(() => w.close());
  beforeEach(() => w.reset());

  const mint = async (
    session: Session,
    body: Partial<CreateApiTokenRequest> = {},
  ): Promise<CreatedApiToken> => {
    const response = await session.send('post', '/auth/api-tokens', {
      name: 'ci',
      scope: 'owner',
      ...body,
    });
    expect(response.status).toBe(201);
    return response.body as CreatedApiToken;
  };

  /** A curl-like caller: the bearer header only — no cookie, no CSRF. */
  const bearer = (token: string) => ({
    get: (path: string) =>
      w.ctx.http().get(path).set('Authorization', `Bearer ${token}`),
    send: (
      method: 'post' | 'patch' | 'delete',
      path: string,
      body?: object,
    ) => {
      const req = w.ctx
        .http()
        [method](path)
        .set('Authorization', `Bearer ${token}`);
      return body ? req.send(body) : req;
    },
  });

  describe('Account › API tokens', () => {
    it('shows the token once and stores only its hash', async () => {
      const created = await mint(w.operator, { name: 'deploy bot' });
      expect(created.token).toMatch(/^ntl_[A-Za-z0-9_-]{40,}$/);
      expect(created).toMatchObject({
        name: 'deploy bot',
        scope: 'owner',
        projects: null,
        status: 'active',
        expiresAt: null,
        lastUsedAt: null,
      });
      expect(created.token.startsWith(created.hint)).toBe(true);

      const row = await w.ctx.prisma.apiToken.findUniqueOrThrow({
        where: { id: created.id },
      });
      expect(row.tokenHash).toBe(hashToken(created.token));
      expect(JSON.stringify(row)).not.toContain(created.token);

      const list = await w.operator.get('/auth/api-tokens');
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).not.toHaveProperty('token');
      expect(list.body[0]).toMatchObject({
        id: created.id,
        hint: created.hint,
      });

      const [record] = await w.audit('auth.api_token_create');
      expect(record.after).toMatchObject({
        name: 'deploy bot',
        scope: 'owner',
      });
      expect(JSON.stringify(record.after)).not.toContain(created.token);
    });

    it('lists only the caller’s own tokens and records their last use', async () => {
      const mine = await mint(w.operator);
      await mint(w.viewer, { name: 'theirs' });

      expect((await bearer(mine.token).get(`${w.path()}/board`)).status).toBe(
        200,
      );
      const list = await w.operator.get('/auth/api-tokens');
      expect(list.body.map((t: { id: string }) => t.id)).toEqual([mine.id]);
      expect(list.body[0].lastUsedAt).not.toBeNull();
    });

    it('refuses an expiry in the past and a project the owner cannot see', async () => {
      const past = await w.operator.send('post', '/auth/api-tokens', {
        name: 'old',
        scope: 'owner',
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      expect(past.status).toBe(400);

      const foreign = await w.operator.send('post', '/auth/api-tokens', {
        name: 'b',
        scope: 'owner',
        projectIds: [w.b],
      });
      expect(foreign.status).toBe(404);
    });
  });

  describe('Bearer requests', () => {
    it('lists and runs cards with no cookie and no CSRF header', async () => {
      const { number } = await w.createCard();
      const { token } = await mint(w.operator);

      const board = await bearer(token).get(`${w.path()}/board`);
      expect(board.status).toBe(200);
      expect(JSON.stringify(board.body)).toContain('Add login');

      const run = await bearer(token).send(
        'post',
        `${w.path()}/board/cards/${number}/run`,
        {},
      );
      expect(run.status).toBeLessThan(300);
      expect(w.sent('card.run')).toHaveLength(1);
    });

    it('attributes every use to the owner via the token in the audit log', async () => {
      const { token, id } = await mint(w.operator, { name: 'release bot' });
      const created = await bearer(token).send(
        'post',
        `${w.path()}/board/cards`,
        { title: 'From a token', body: 'Made over curl.' },
      );
      expect(created.status).toBe(201);

      const [record] = await w.audit('card.created');
      expect(record.actorUserId).toBe(w.operatorId);
      expect(record.meta).toMatchObject({
        apiToken: { id, name: 'release bot' },
      });
    });

    it('refuses an unknown token', async () => {
      const response = await bearer('ntl_not-a-real-token').get(
        `${w.path()}/board`,
      );
      expect(response.status).toBe(401);
    });

    it('never exceeds the owner’s current role', async () => {
      const { number } = await w.createCard();
      const { token } = await mint(w.operator);
      await w.ctx.prisma.user.update({
        where: { id: w.operatorId },
        data: { role: 'viewer' },
      });

      const run = await bearer(token).send(
        'post',
        `${w.path()}/board/cards/${number}/run`,
        {},
      );
      expect(run.status).toBe(403);
      expect(w.sent('card.run')).toHaveLength(0);
      expect((await bearer(token).get(`${w.path()}/board`)).status).toBe(200);

      // A disabled owner's token stops working altogether.
      await w.ctx.prisma.user.update({
        where: { id: w.operatorId },
        data: { status: 'disabled' },
      });
      expect((await bearer(token).get(`${w.path()}/board`)).status).toBe(401);
    });

    it('cannot reach a project its owner is not a member of', async () => {
      const { token } = await mint(w.operator);
      expect((await bearer(token).get(`${w.path(w.b)}/board`)).status).toBe(
        404,
      );
    });

    it('is refused on the session-only routes: tokens, sessions, the Telegram link', async () => {
      const { token } = await mint(w.operator);
      const minted = await bearer(token).send('post', '/auth/api-tokens', {
        name: 'wider',
        scope: 'owner',
      });
      expect(minted.status).toBe(403);
      expect(minted.body.error).toBe('api_token_not_allowed');
      expect((await bearer(token).get('/auth/api-tokens')).status).toBe(403);
      expect((await bearer(token).get('/auth/sessions')).status).toBe(403);

      // A linked Telegram chat signs in the Mini App with a browser session.
      for (const [method, path] of [
        ['post', '/notifications/telegram/link'],
        ['post', '/notifications/telegram/link/confirm'],
        ['delete', '/notifications/telegram/link'],
        ['delete', '/notifications/telegram/link/pending'],
      ] as const) {
        const response = await bearer(token).send(method, path, {});
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('api_token_not_allowed');
      }
      expect(
        (await bearer(token).get('/notifications/telegram/link')).status,
      ).toBe(403);

      const me = await bearer(token).get('/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.email).toBe('op@x.test');
    });

    it('refuses an admin token a terminal ticket, which needs the browser session', async () => {
      const { token } = await mint(w.admin);
      const ticket = await bearer(token).send('post', '/terminal/tickets', {});
      expect(ticket.status).toBe(403);
      expect(ticket.body.error).toBe('api_token_not_allowed');
    });

    it('skips CSRF only for a personal API token', async () => {
      const { number } = await w.createCard();
      const path = `${w.path()}/board/cards/${number}/run`;

      // A session cookie without the CSRF header is refused, with or
      // without a bearer header that is not a personal API token.
      const bare = await w.operator.sendWithoutCsrf('post', path);
      expect(bare.status).toBe(403);
      expect(bare.body.error).toBe('csrf_failed');
      const foreign = await w.operator
        .sendWithoutCsrf('post', path)
        .set('Authorization', 'Bearer not-a-personal-token');
      expect(foreign.status).toBe(403);
      expect(foreign.body.error).toBe('csrf_failed');
      expect(w.sent('card.run')).toHaveLength(0);
    });
  });

  describe('Scope', () => {
    it('a read-only token reads but is refused every write', async () => {
      const { number } = await w.createCard();
      const { token } = await mint(w.operator, { scope: 'read_only' });

      expect((await bearer(token).get(`${w.path()}/board`)).status).toBe(200);
      expect(
        (await bearer(token).get(`${w.path()}/board/cards/${number}`)).status,
      ).toBe(200);

      const run = await bearer(token).send(
        'post',
        `${w.path()}/board/cards/${number}/run`,
        {},
      );
      expect(run.status).toBe(403);
      expect(run.body.error).toBe('api_token_read_only');
      const create = await bearer(token).send(
        'post',
        `${w.path()}/board/cards`,
        { title: 'Nope', body: 'Read only.' },
      );
      expect(create.status).toBe(403);
      const del = await bearer(token).send(
        'delete',
        `${w.path()}/board/cards/${number}`,
      );
      expect(del.status).toBe(403);
      expect(w.sent('card.run')).toHaveLength(0);
    });

    it('a token limited to projects reaches only those projects', async () => {
      const { token, projects } = await mint(w.admin, { projectIds: [w.a] });
      expect(projects).toEqual([{ id: w.a, name: expect.any(String) }]);

      expect((await bearer(token).get(`${w.path(w.a)}/board`)).status).toBe(
        200,
      );
      // The admin owner sees project B, the token does not.
      expect((await bearer(token).get(`${w.path(w.b)}/board`)).status).toBe(
        404,
      );

      const list = await bearer(token).get('/projects');
      expect(list.status).toBe(200);
      expect(list.body.map((p: { id: string }) => p.id)).toEqual([w.a]);

      // Instance-wide routes are refused even though the owner is an admin.
      const users = await bearer(token).get('/admin/users');
      expect(users.status).toBe(403);
      expect(users.body.error).toBe('api_token_project_scoped');
      expect((await bearer(token).get('/activity')).status).toBe(403);
    });

    it('a token for every project keeps the owner’s instance-wide reach', async () => {
      const { token } = await mint(w.admin);
      expect((await bearer(token).get(`${w.path(w.b)}/board`)).status).toBe(
        200,
      );
      expect((await bearer(token).get('/admin/users')).status).toBe(200);
    });
  });

  describe('Expiry', () => {
    it('an expired token is refused and listed as expired', async () => {
      const { token, id } = await mint(w.operator, {
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      expect((await bearer(token).get(`${w.path()}/board`)).status).toBe(200);

      await w.ctx.prisma.apiToken.update({
        where: { id },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });
      expect((await bearer(token).get(`${w.path()}/board`)).status).toBe(401);

      const list = await w.operator.get('/auth/api-tokens');
      expect(list.body[0]).toMatchObject({ id, status: 'expired' });
    });
  });

  describe('Revoke', () => {
    it('the owner revokes a token, which then stops working', async () => {
      const { token, id } = await mint(w.operator);
      const revoked = await w.operator.send('delete', `/auth/api-tokens/${id}`);
      expect(revoked.status).toBe(200);
      expect(revoked.body).toMatchObject({ id, status: 'revoked' });

      expect((await bearer(token).get(`${w.path()}/board`)).status).toBe(401);
      const [record] = await w.audit('auth.api_token_revoke');
      expect(record.actorUserId).toBe(w.operatorId);
    });

    it('a user cannot revoke someone else’s token', async () => {
      const { token, id } = await mint(w.operator);
      const response = await w.viewer.send('delete', `/auth/api-tokens/${id}`);
      expect(response.status).toBe(404);
      expect((await bearer(token).get(`${w.path()}/board`)).status).toBe(200);
    });

    it('an admin sees every user’s tokens and revokes them', async () => {
      const { token, id } = await mint(w.operator, { name: 'laptop' });
      await mint(w.viewer, { name: 'phone' });

      expect((await w.operator.get('/admin/api-tokens')).status).toBe(403);

      const list = await w.admin.get('/admin/api-tokens');
      expect(list.status).toBe(200);
      expect(
        list.body
          .map(
            (t: { userEmail: string; name: string }) =>
              `${t.userEmail}:${t.name}`,
          )
          .sort(),
      ).toEqual(['op@x.test:laptop', 'viewer@x.test:phone']);

      const revoked = await w.admin.send('delete', `/admin/api-tokens/${id}`);
      expect(revoked.status).toBe(200);
      expect((await bearer(token).get(`${w.path()}/board`)).status).toBe(401);

      const [record] = await w.audit('auth.api_token_revoke');
      expect(record.meta).toMatchObject({
        ownerId: w.operatorId,
      });
    });

    it('an admin token cannot manage tokens', async () => {
      const { token } = await mint(w.admin);
      expect((await bearer(token).get('/admin/api-tokens')).status).toBe(403);
    });
  });
});
