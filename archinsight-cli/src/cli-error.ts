export class CliError extends Error {
  public constructor(
    message: string,
    public readonly code = "CLI",
    public readonly sourceName = "-",
    public readonly line = 0,
    public readonly column = 0,
  ) {
    super(message);
  }
}
