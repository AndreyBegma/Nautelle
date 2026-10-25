import { Field, Input } from '@andrewbehma/glass-ui/field';
import { Radio, RadioGroup } from '@andrewbehma/glass-ui/radio-group';
import type { ToolRuleScope } from '@nautelle/shared';
import type { rememberOptions } from '../../lib/approvals/action-requests';
import {
  type InputSegment,
  REDACTION_MASK,
  type ToolUseReview,
} from '../../lib/approvals/tool-use-review';

function Segment({ segment }: { segment: InputSegment }) {
  if (segment.kind === 'text') return <>{segment.text}</>;
  if (segment.kind === 'redacted') {
    return (
      <mark
        data-redacted
        title="Redacted by the runner"
        className="rounded bg-surface-2 px-1 text-ink-3"
      >
        {REDACTION_MASK}
      </mark>
    );
  }
  return (
    <mark
      data-marker
      className="mx-px rounded bg-danger/20 px-1 font-mono text-xs text-danger"
    >
      {`‹${segment.label}›`}
    </mark>
  );
}

/**
 * The redacted input as text, with control, bidi and zero-width characters shown
 * as markers. It is untrusted: never markup. `className` caps the height.
 */
export function RevealedInput({
  segments,
  className,
}: {
  segments: InputSegment[];
  className?: string;
}) {
  return (
    <pre
      className={`overflow-auto whitespace-pre-wrap break-words rounded bg-surface-2 p-2 font-mono text-xs text-ink ${className ?? ''}`}
    >
      {segments.map((segment, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the segments never reorder
        <Segment key={i} segment={segment} />
      ))}
    </pre>
  );
}

const WHY: Record<'no_input' | 'truncated', string> = {
  no_input:
    'This request carries no input, so there is nothing to read before you approve.',
  truncated:
    'Only the start and the end of the input are shown; the middle was cut. Part of what will run is not on this screen.',
};

/** The body of the approve dialog of a `tool_use` request. */
export function ToolUseDialogBody({
  review,
  typed,
  onTyped,
}: {
  review: ToolUseReview;
  typed: string;
  onTyped: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p>
        Approving lets the session run <strong>{review.toolName}</strong> with
        this input, on this machine. Read all of it.
      </p>
      {review.segments.length > 0 ? (
        <RevealedInput segments={review.segments} className="max-h-[50vh]" />
      ) : null}
      {review.reason ? (
        <div className="flex flex-col gap-2">
          <p role="alert">{WHY[review.reason]}</p>
          <Field
            label={`Type ${review.toolName} to approve`}
            htmlFor="tool-use-confirm-name"
          >
            <Input
              id="tool-use-confirm-name"
              autoComplete="off"
              value={typed}
              onChange={(e) => onTyped(e.target.value)}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

const SCOPE_LABEL: Record<ToolRuleScope, string> = {
  session: 'Allow similar in this session',
  project: 'Always allow in this project',
};

const SCOPE_HINT: Record<ToolRuleScope, string> = {
  session: 'Until the session ends',
  project: 'Until you remove the rule in project settings',
};

/**
 * C-401: approve this call only, or also allow similar calls — for the rest
 * of the session or always in this project — by the rules shown; or why
 * this call always asks.
 */
export function RememberChoice({
  options,
  value,
  disabled,
  onChange,
}: {
  options: NonNullable<ReturnType<typeof rememberOptions>>;
  value: ToolRuleScope | undefined;
  disabled: boolean;
  onChange: (value: ToolRuleScope | undefined) => void;
}) {
  if (options.reason) {
    return <p className="text-sm text-ink-3">{options.reason}.</p>;
  }
  const rules = options.rules.join(', ');
  return (
    <RadioGroup label="Similar calls">
      <Radio
        name="tool-use-remember"
        label="Allow this call only"
        checked={value === undefined}
        disabled={disabled}
        onChange={() => onChange(undefined)}
      />
      {options.scopes.map((scope) => (
        <Radio
          key={scope}
          name="tool-use-remember"
          label={SCOPE_LABEL[scope]}
          hint={`${SCOPE_HINT[scope]}: ${rules}`}
          checked={value === scope}
          disabled={disabled}
          onChange={() => onChange(scope)}
        />
      ))}
    </RadioGroup>
  );
}
