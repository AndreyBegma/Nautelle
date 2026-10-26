import type {
  Capabilities,
  Host,
  SessionMessageArgs,
  SessionMessageResult,
  TerminalAttachArgs,
  TerminalAttachResult,
  WatchedProject,
} from '@nautelle/shared/protocol';
import type { AssessHandlers } from '../assess';
import type { CaptureHandlers } from '../capture';
import {
  type CardHandlers,
  cardChecks,
  closeCardPr,
  mergeCard,
  openCardPr,
  publishCardReview,
  retargetCardPr,
  retriggerCardCi,
} from '../cards';
import { type Clock, isoNow } from '../clock';
import type { ConfigProfile } from '../config';
import {
  messageOrchestrator,
  orchestratorStatus,
  startOrchestrator,
  stopOrchestrator,
} from '../control/orchestrator';
import { messageSlot, stopSlot } from '../control/slot';
import type { DemoHandlers } from '../demos';
import { type Exec, withSignal } from '../detect/exec';
import type { DocsHandlers } from '../docs';
import type { HandoffHandlers } from '../handoff';
import type { NormalizeHandlers } from '../normalize';
import type { PlannerHandlers } from '../planner';
import type { Realpath } from '../policy/roots';
import type { PolicyConfig } from '../policy/schema';
import type { PrefixHandlers } from '../prefix';
import { discoverProjects } from '../projects/discover';
import type { ProjectFs } from '../projects/fs';
import { inspectProject, refreshProject } from '../projects/inspect';
import { pushCheck } from '../projects/push-check';
import { scanProjectRules } from '../projects/rule-scan';
import type { RepoHandlers } from '../repo';
import type { SkillHandlers } from '../skills';
import type { StewardHandlers } from '../steward';
import type { UiProfileHandlers } from '../uiprofile';
import {
  prApprove,
  prRequestChanges,
  prVoidApproval,
} from './approvals/decide';
import { prInspect } from './approvals/inspect';
import type { CommandHandlers } from './dispatcher';
import { CommandFailure } from './failure';
import { type CollectorPollDeps, collectorPoll } from './github/collector-poll';
import { issueCreate } from './queue/issue-create';
import { issuesRefresh } from './queue/issues-refresh';
import {
  type SessionBackfillContext,
  sessionBackfill,
} from './session-backfill';
import { worktreeStatus } from './worktree/status';

export interface HandlerContext {
  clock: Clock;
  runnerVersion: string;
  host: Host;
  /** Re-detects the machine: `runner.describe` reports the current state. */
  detectCapabilities: () => Promise<Capabilities>;
  exec: Exec;
  /** The current watch list, as the server last sent it. */
  watchedProjects: () => readonly WatchedProject[];
  /** The runtime profiles of the runner config; the orchestrator starts on one. */
  profiles: () => readonly ConfigProfile[];
  /** The runner-local policy as it is now (ADR-0047). */
  policy: () => PolicyConfig;
  /** Resolves a root for the policy; the filesystem's by default. */
  realpath?: Realpath;
  /** Tests inject a spying filesystem; the daemon uses the real one. */
  fs?: ProjectFs;
  /** The session watcher's backfill; absent when sessions are disabled. */
  backfillSessions?: SessionBackfillContext['backfill'];
  /** `collector.poll` (spec 27): the collector registry's `pollNow`. */
  pollCollectors?: CollectorPollDeps['pollNow'];
  /** Interactive attaches (spec 29); absent means this runner cannot attach. */
  terminal?: {
    attach(
      args: TerminalAttachArgs,
      signal?: AbortSignal,
    ): Promise<TerminalAttachResult>;
  };
  /** Skills (spec 24); absent means this runner does not serve them. */
  skills?: SkillHandlers;
  /** The planner (spec 172); absent means this runner does not serve plans. */
  planner?: PlannerHandlers;
  /** UI profiles (spec 223); absent means this runner does not build them. */
  uiprofile?: UiProfileHandlers;
  /** Board card workers (#242); absent means this runner does not run them. */
  cards?: CardHandlers;
  /** Card capture (#244); absent means this runner does not extract cards. */
  capture?: CaptureHandlers;
  /** Text normalization (#271); absent means this runner does not translate text. */
  normalize?: NormalizeHandlers;
  /** Card model assessment (#322); absent means this runner does not assess cards. */
  assess?: AssessHandlers;
  /** Docs repositories (#379); absent means this runner does not write to them. */
  docs?: DocsHandlers;
  /** Steward's actions (#447); absent means this runner does not serve them. */
  steward?: StewardHandlers;
  /** Context handoff (#449); absent means this runner does not serve it. */
  handoff?: HandoffHandlers;
  /** A person's messages to sessions (#489); absent means this runner does not serve them. */
  sessionMessage?: {
    message(
      args: SessionMessageArgs,
      signal?: AbortSignal,
    ): Promise<SessionMessageResult>;
  };
  /** The assistant's code commands (#622); absent means this runner does not serve them. */
  repo?: RepoHandlers;
  /** The launch prefix's calls (#751); absent means this runner does not serve them. */
  prefix?: PrefixHandlers;
  /** Demo videos (C-369); absent means this runner does not record them. */
  demos?: DemoHandlers;
}

const noRepo = (): never => {
  throw new CommandFailure(
    'unsupported',
    'this runner does not serve code questions',
  );
};

const noHandoff = (): never => {
  throw new CommandFailure(
    'unsupported',
    'this runner does not serve Context handoff',
  );
};

const noSteward = (): never => {
  throw new CommandFailure('unsupported', 'this runner does not serve Steward');
};

const noAssess = (): never => {
  throw new CommandFailure('unsupported', 'this runner does not assess cards');
};

const noNormalize = (): never => {
  throw new CommandFailure(
    'unsupported',
    'this runner does not normalize text',
  );
};

const noCards = (): never => {
  throw new CommandFailure(
    'unsupported',
    'this runner does not run board card workers',
  );
};

const noCapture = (): never => {
  throw new CommandFailure(
    'unsupported',
    'this runner does not run card capture',
  );
};

const noSkills = (): never => {
  throw new CommandFailure('unsupported', 'this runner does not serve skills');
};

const noDocs = (): never => {
  throw new CommandFailure(
    'unsupported',
    'this runner does not write to docs repositories',
  );
};

const noPlanner = (): never => {
  throw new CommandFailure('unsupported', 'this runner does not serve plans');
};

const noDemo = (): never => {
  throw new CommandFailure(
    'unsupported',
    'this runner does not record demo videos',
  );
};

const noUiProfile = (): never => {
  throw new CommandFailure(
    'unsupported',
    'this runner does not serve UI profiles',
  );
};

/** One handler per allowlisted command; each later command adds its own here. */
export const createHandlers = (context: HandlerContext): CommandHandlers => {
  // #754 D2: what a command spawns gets its signal, so a timeout kills it.
  const execOf = (signal?: AbortSignal) => withSignal(context.exec, signal);
  const deps = (signal?: AbortSignal) => ({
    exec: execOf(signal),
    fs: context.fs,
  });
  const control = (signal?: AbortSignal) => ({
    exec: execOf(signal),
    clock: context.clock,
    watchedProjects: context.watchedProjects,
    profiles: context.profiles,
    policy: context.policy,
    realpath: context.realpath,
  });
  const approvals = (signal?: AbortSignal) => ({
    exec: execOf(signal),
    clock: context.clock,
    watchedProjects: context.watchedProjects,
  });
  return {
    'runner.ping': () => ({ pong: true, ts: isoNow(context.clock) }),
    'runner.describe': async () => ({
      ...context.host,
      runnerVersion: context.runnerVersion,
      capabilities: await context.detectCapabilities(),
    }),
    'project.inspect': ({ path }, signal) => inspectProject(path, deps(signal)),
    'project.refresh': (args, signal) =>
      refreshProject(args, context.watchedProjects(), deps(signal)),
    'project.scan_rules': ({ path }, signal) =>
      scanProjectRules(path, deps(signal)),
    'project.discover': () =>
      discoverProjects(context.policy().allowedRoots, context.fs),
    'project.push_check': ({ path }, signal) => pushCheck(path, deps(signal)),
    'session.backfill': (args) =>
      sessionBackfill(args, {
        backfill: context.backfillSessions,
        watchedProjects: context.watchedProjects,
      }),
    'orchestrator.start': (args, signal) =>
      startOrchestrator(args, control(signal)),
    'orchestrator.stop': (args, signal) =>
      stopOrchestrator(args, control(signal)),
    'orchestrator.status': (args, signal) =>
      orchestratorStatus(args, control(signal)),
    'orchestrator.message': (args, signal) =>
      messageOrchestrator(args, control(signal)),
    'slot.stop': (args, signal) => stopSlot(args, control(signal)),
    'slot.message': (args, signal) => messageSlot(args, control(signal)),
    'issue.create': (args, signal) =>
      issueCreate(args, {
        exec: execOf(signal),
        watchedProjects: context.watchedProjects,
      }),
    'issues.refresh': (args) =>
      issuesRefresh(args, { watchedProjects: context.watchedProjects }),
    'collector.poll': (args) =>
      collectorPoll(args, {
        watchedProjects: context.watchedProjects,
        pollNow: context.pollCollectors ?? (async () => []),
      }),
    'pr.inspect': (args, signal) => prInspect(args, approvals(signal)),
    'pr.approve': (args, signal) => prApprove(args, approvals(signal)),
    'pr.requestChanges': (args, signal) =>
      prRequestChanges(args, approvals(signal)),
    'pr.voidApproval': (args, signal) =>
      prVoidApproval(args, approvals(signal)),
    'terminal.attach': (args, signal) => {
      if (!context.terminal) {
        throw new CommandFailure(
          'unsupported',
          'this runner does not serve terminal attaches',
        );
      }
      return context.terminal.attach(args, signal);
    },
    'skill.search': (args, signal) =>
      context.skills?.['skill.search'](args, signal) ?? noSkills(),
    'skill.inspect': (args, signal) =>
      context.skills?.['skill.inspect'](args, signal) ?? noSkills(),
    'skill.install': (args, signal) =>
      context.skills?.['skill.install'](args, signal) ?? noSkills(),
    'skill.uninstall': (args, signal) =>
      context.skills?.['skill.uninstall'](args, signal) ?? noSkills(),
    'skill.list': (args, signal) =>
      context.skills?.['skill.list'](args, signal) ?? noSkills(),
    'skill.run': (args, signal) =>
      context.skills?.['skill.run'](args, signal) ?? noSkills(),
    'skill.cancel': (args, signal) =>
      context.skills?.['skill.cancel'](args, signal) ?? noSkills(),
    'plan.turn': (args, signal) =>
      context.planner?.['plan.turn'](args, signal) ?? noPlanner(),
    'plan.cancel': (args, signal) =>
      context.planner?.['plan.cancel'](args, signal) ?? noPlanner(),
    'plan.close': (args, signal) =>
      context.planner?.['plan.close'](args, signal) ?? noPlanner(),
    'plan.publish_specs': (args, signal) =>
      context.planner?.['plan.publish_specs'](args, signal) ?? noPlanner(),
    'plan.queue_issues': (args, signal) =>
      context.planner?.['plan.queue_issues'](args, signal) ?? noPlanner(),
    'uiprofile.build': (args, signal) =>
      context.uiprofile?.['uiprofile.build'](args, signal) ?? noUiProfile(),
    'uiprofile.fingerprint': (args, signal) =>
      context.uiprofile?.['uiprofile.fingerprint'](args, signal) ??
      noUiProfile(),
    'uiprofile.cancel': (args, signal) =>
      context.uiprofile?.['uiprofile.cancel'](args, signal) ?? noUiProfile(),
    'uiprofile.learn': (args, signal) =>
      context.uiprofile?.['uiprofile.learn'](args, signal) ?? noUiProfile(),
    'worktree.status': (args, signal) =>
      worktreeStatus(args, {
        exec: execOf(signal),
        watchedProjects: context.watchedProjects,
      }),
    'card.run': (args, signal) =>
      context.cards?.['card.run'](args, signal) ?? noCards(),
    'card.stop': (args, signal) =>
      context.cards?.['card.stop'](args, signal) ?? noCards(),
    'card.collect': (args, signal) =>
      context.cards?.['card.collect'](args, signal) ?? noCards(),
    'card.close': (args, signal) =>
      context.cards?.['card.close'](args, signal) ?? noCards(),
    'card.merge': (args, signal) =>
      context.cards
        ? mergeCard(args, {
            exec: execOf(signal),
            watchedProjects: context.watchedProjects,
          })
        : noCards(),
    'card.prClose': (args, signal) =>
      context.cards
        ? closeCardPr(args, {
            exec: execOf(signal),
            watchedProjects: context.watchedProjects,
          })
        : noCards(),
    'card.checks': (args, signal) =>
      context.cards
        ? cardChecks(args, {
            exec: execOf(signal),
            watchedProjects: context.watchedProjects,
          })
        : noCards(),
    'card.ciRetrigger': (args, signal) =>
      context.cards
        ? retriggerCardCi(args, {
            exec: execOf(signal),
            watchedProjects: context.watchedProjects,
          })
        : noCards(),
    'card.prRetarget': (args, signal) =>
      context.cards
        ? retargetCardPr(args, {
            exec: execOf(signal),
            watchedProjects: context.watchedProjects,
          })
        : noCards(),
    'card.prOpen': (args, signal) =>
      context.cards
        ? openCardPr(args, {
            exec: execOf(signal),
            watchedProjects: context.watchedProjects,
          })
        : noCards(),
    // #884: review steps (ADR-0084), advertised like every handler (ADR-0023).
    'card.review': (args, signal) =>
      context.cards?.['card.review'](args, signal) ?? noCards(),
    'card.reviewStop': (args, signal) =>
      context.cards?.['card.reviewStop'](args, signal) ?? noCards(),
    'card.reviewPublish': (args, signal) =>
      context.cards
        ? publishCardReview(args, {
            exec: execOf(signal),
            watchedProjects: context.watchedProjects,
          })
        : noCards(),
    'card.demo': (args, signal) =>
      context.demos?.['card.demo'](args, signal) ?? noDemo(),
    'cards.extract': (args, signal) =>
      context.capture?.['cards.extract'](args, signal) ?? noCapture(),
    'text.normalize': (args, signal) =>
      context.normalize?.['text.normalize'](args, signal) ?? noNormalize(),
    'card.assess': (args, signal) =>
      context.assess?.['card.assess'](args, signal) ?? noAssess(),
    'docs.publish_specs': (args, signal) =>
      context.docs?.['docs.publish_specs'](args, signal) ?? noDocs(),
    'docs.pr_state': (args, signal) =>
      context.docs?.['docs.pr_state'](args, signal) ?? noDocs(),
    'session.nudge': (args, signal) =>
      context.steward?.['session.nudge'](args, signal) ?? noSteward(),
    'session.dismiss': (args, signal) =>
      context.steward?.['session.dismiss'](args, signal) ?? noSteward(),
    'card.resume': (args, signal) =>
      context.steward?.['card.resume'](args, signal) ?? noSteward(),
    'digest.compose': (args, signal) =>
      context.steward?.['digest.compose'](args, signal) ?? noSteward(),
    'card.handoff.set': (args, signal) =>
      context.handoff?.['card.handoff.set'](args, signal) ?? noHandoff(),
    'session.message': (args, signal) => {
      if (!context.sessionMessage) {
        throw new CommandFailure(
          'unsupported',
          'this runner does not serve session messages',
        );
      }
      return context.sessionMessage.message(args, signal);
    },
    'repo.search': (args, signal) =>
      context.repo?.['repo.search'](args, signal) ?? noRepo(),
    'repo.read': (args, signal) =>
      context.repo?.['repo.read'](args, signal) ?? noRepo(),
    'code.ask': (args, signal) =>
      context.repo?.['code.ask'](args, signal) ?? noRepo(),
    'rules.compress': (args, signal) =>
      context.prefix?.['rules.compress'](args, signal) ?? noPrefix(),
    'prefix.propose': (args, signal) =>
      context.prefix?.['prefix.propose'](args, signal) ?? noPrefix(),
  };
};

const noPrefix = (): never => {
  throw new CommandFailure(
    'unsupported',
    'this runner does not serve the launch prefix calls',
  );
};
