export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

export class BlockedStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedStateError";
  }
}

export class RejectedProgressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RejectedProgressionError";
  }
}
