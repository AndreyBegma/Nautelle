import { SETTINGS_SECTIONS, type SettingsItemId } from './settings-sections';

/**
 * C-395: one setting of the project settings page, as the search finds it —
 * its label and help text as the block shows them. A result jumps to its
 * block (`item`, the former tab id the page already scrolls to); the block
 * is the one place the setting is edited.
 */
export interface SettingEntry {
  item: SettingsItemId;
  label: string;
  help?: string;
  /** Words a person searches for that the label and help do not say. */
  keywords?: string;
}

/**
 * Every setting of the page, block by block in page order. Kept next to the
 * blocks' copy by hand: a setting added to a block is added here too.
 */
export const SETTINGS_CATALOGUE: readonly SettingEntry[] = [
  // Project › General
  { item: 'general', label: 'Display name' },
  {
    item: 'general',
    label: 'Base branch override',
    help: 'Empty uses the detected base branch.',
    keywords: 'develop main',
  },
  {
    item: 'general',
    label: 'Ready label override',
    help: 'Empty uses the label from the Code Sentinel config.',
  },
  {
    item: 'general',
    label: 'Default runtime profile',
    help: 'Profiles of the runner.',
    keywords: 'claude codex agent',
  },
  {
    item: 'general',
    label: 'Merge approval',
    help: 'A person approves every pull request before the orchestrator merges it.',
  },
  {
    item: 'general',
    label: 'Store text in English',
    help: "Text is translated by a small model on this project's runner.",
    keywords: 'translate language',
  },
  {
    item: 'general',
    label: 'GitHub App',
    help: 'Manage in Integrations.',
    keywords: 'install permissions',
  },
  { item: 'general', label: 'Remove project', keywords: 'delete danger' },
  // Project › Members
  {
    item: 'members',
    label: 'Add member',
    help: "An override can only lower a member's role.",
    keywords: 'user people access',
  },
  { item: 'members', label: 'Role override', keywords: 'viewer operator' },
  // Project › Docs source
  {
    item: 'docs',
    label: 'Spec folder',
    help: 'Card and plan specs are committed here.',
    keywords: 'specification',
  },
  {
    item: 'docs',
    label: 'Docs source override',
    help: 'The kind, local clone or repository the docs are read from.',
    keywords: 'documentation adr',
  },
  // Project › Coding rules
  {
    item: 'rules',
    label: 'Coding rules',
    help: 'Write it as an instruction to the agent.',
    keywords: 'conventions',
  },
  { item: 'rules', label: 'Scan project for rules' },
  { item: 'rules', label: 'Import rules from Markdown' },
  { item: 'rules', label: 'Applies to card types' },
  // Automation › Orchestrator
  {
    item: 'orchestrator',
    label: 'Orchestrator runtime profile',
    help: "None uses the project's default profile.",
  },
  { item: 'orchestrator', label: 'Orchestrator model' },
  {
    item: 'orchestrator',
    label: 'Permission mode',
    help: 'Whether the orchestrator runs without asking; it is audited.',
  },
  // Automation › Board
  {
    item: 'board',
    label: 'Create a GitHub issue on Run',
    help: 'The issue is never queued for the orchestrator.',
  },
  {
    item: 'board',
    label: 'Write a spec on Run',
    help: 'Needs a spec directory.',
  },
  {
    item: 'board',
    label: 'Automatic work for terminal sessions',
    help: 'Push and open a pull request when its session ends.',
  },
  {
    item: 'board',
    label: 'Merge finished cards automatically',
    keywords: 'auto-merge',
  },
  { item: 'board', label: 'Merge pull requests of finished cards' },
  {
    item: 'board',
    label: 'Workers at once',
    keywords: 'parallel concurrency limit slots',
  },
  { item: 'board', label: 'Background wait warning, minutes' },
  {
    item: 'board',
    label: 'Suggest cards from sessions',
    help: 'The model on the runner that reads the sessions.',
    keywords: 'capture',
  },
  // Automation › Review
  {
    item: 'review',
    label: 'Review PRs before Finished',
    help: 'After CI is green, each enabled step reviews the pull request.',
  },
  { item: 'review', label: 'Publish findings as PR comments' },
  { item: 'review', label: 'Review steps', keywords: 'skill' },
  { item: 'review', label: 'Peer review instructions' },
  // Automation › Demo videos
  {
    item: 'demo-videos',
    label: 'Record a demo for finished UI cards',
    help: 'A failed demo never blocks merging.',
    keywords: 'demoflow video recording',
  },
  {
    item: 'demo-videos',
    label: 'UI paths',
    help: 'A card whose branch changes a file matching any of these globs is a UI card.',
  },
  { item: 'demo-videos', label: 'Send a ready demo to Telegram' },
  {
    item: 'demo-videos',
    label: 'Demo env secrets',
    help: 'Environment values the scenario reads.',
  },
  // Automation › Sessions
  {
    item: 'sessions',
    label: 'Terminal → Board setup',
    help: "Work you do in your own terminal reaches this project's Board once each step is done.",
    keywords: 'claude code plugin agentdock nautelle',
  },
  {
    item: 'sessions',
    label: 'Keep session content',
    help: 'Prompts, tool inputs and outputs, and responses.',
  },
  {
    item: 'sessions',
    label: 'Retention (days)',
    help: 'Content older than this is deleted every night.',
  },
  { item: 'sessions', label: 'Purge content' },
  // Automation › Steward
  {
    item: 'steward',
    label: 'Steward',
    help: 'Watches Board cards and runner runs for stuck work.',
  },
  { item: 'steward', label: 'Silence threshold (minutes)' },
  { item: 'steward', label: 'Digest time' },
  { item: 'steward', label: 'Nudge after an API or network error' },
  { item: 'steward', label: 'Dismiss known dialogs' },
  { item: 'steward', label: 'Resume a dead card session' },
  { item: 'steward', label: 'Hold pushes with a Claude trailer' },
  // Planning › Planner
  { item: 'planner', label: 'Specification output' },
  {
    item: 'planner',
    label: 'Planner instructions',
    help: 'How to split work, how to ask, and the specification rules.',
  },
  // Planning › Design
  {
    item: 'design',
    label: 'UI profile',
    help: 'The summary, style kit and snippets new designs start from.',
  },
  { item: 'design', label: 'Approved screens and style rules' },
  {
    item: 'design',
    label: 'Viewport presets',
    help: 'The screens the viewer offers.',
  },
  { item: 'design', label: 'Default design skills' },
  {
    item: 'design',
    label: 'Design templates',
    help: 'The frames a design draws.',
  },
  // Planning › AI digest
  {
    item: 'ai-digest',
    label: 'Daily AI digest',
    help: "Once a day the project's AI model sums up the last day.",
    keywords: 'summary timezone',
  },
  // Cost › Budget
  {
    item: 'budget',
    label: 'Budgets',
    help: 'Spend is counted in API-equivalent dollars. A stop budget refuses new orchestrator starts and skill runs.',
    keywords: 'money spend cost limit usd',
  },
  {
    item: 'budget',
    label: 'Budget thresholds (%)',
    help: 'Each one sends one notification per period.',
  },
  {
    item: 'budget',
    label: 'When the limit is reached',
    help: 'Alert only, or stop new spend.',
  },
  // Cost › Token saver
  {
    item: 'token-saver',
    label: 'Token saver',
    help: 'Compresses what agents read: command output, unused MCP tool schemas, a long history.',
  },
  {
    item: 'token-saver',
    label: 'MCP servers agents load',
    help: 'agentdock is always loaded.',
  },
  { item: 'token-saver', label: 'Tokens per launch' },
  { item: 'token-saver', label: 'Selection per card type' },
  { item: 'token-saver', label: 'Share of cards in test arm B' },
];

/** A setting the search found, with where it lives on the page. */
export interface SettingMatch extends SettingEntry {
  /** "Cost › Budget". */
  where: string;
}

const WHERE: Readonly<Record<SettingsItemId, string>> = Object.fromEntries(
  SETTINGS_SECTIONS.flatMap((section) =>
    section.items.map((item) => [item.id, `${section.label} › ${item.label}`]),
  ),
) as Record<SettingsItemId, string>;

/**
 * The settings whose label, help, keywords or block hold every word of
 * `query`, in any order. Those whose label holds them all come first; the
 * rest keep page order. An empty query finds nothing.
 */
export function searchSettings(query: string): SettingMatch[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const holds = (text: string) => {
    const haystack = text.toLowerCase();
    return words.every((word) => haystack.includes(word));
  };
  const found = SETTINGS_CATALOGUE.filter((entry) =>
    holds(
      [entry.label, entry.help, entry.keywords, WHERE[entry.item]].join(' '),
    ),
  ).map((entry) => ({ ...entry, where: WHERE[entry.item] }));
  return [
    ...found.filter((entry) => holds(entry.label)),
    ...found.filter((entry) => !holds(entry.label)),
  ];
}
