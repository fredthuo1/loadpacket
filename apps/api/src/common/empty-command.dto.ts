// A real DTO makes the global whitelist reject injected fields on commands
// that have no user-editable body. Authentication/tenant IDs come from guards.
export class EmptyCommandDto {}
