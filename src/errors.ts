/**
 * Error type carrying an HTTP status code so route handlers can translate
 * card/reader failures into the right response without leaking stack traces.
 */
export class AgentError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AgentError";
  }
}
