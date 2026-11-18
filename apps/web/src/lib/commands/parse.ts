// =============================================================================
// Iron Ledger — command parser (docs/command-language.md → Commands)
//
// The parser lives in packages/shared/src/command.js, so the content linter
// (scripts/lint-dsl.mjs) checks the commands in content links with the same
// one the command bar and the log use. This module re-exports it for the web
// app's commands/ modules.
// =============================================================================

export {
	VERBS,
	OPERATORS,
	QUALIFIER_KINDS,
	normName,
	parseCommand,
	quoteName,
	parseAmount,
	ROLL_DIE_SIDES,
	ROLL_MAX_N,
	ROLL_MAX_MODIFIER,
	ROLL_MAX_GROUPS,
	parseRollGroup,
	parseRoll,
	BUILTIN_VALUES,
	OWNER_KEYWORDS,
	LINK_VERBS,
} from '@ironledger/shared';
export type {
	Verb,
	Op,
	QualifierKind,
	NamePart,
	Parsed,
	ValueCommand,
	Amount,
	RollDieSides,
	RollGroup,
	BuiltinKind,
} from '@ironledger/shared';
