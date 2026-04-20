export interface CommandEnvelope<T> {
  ok: boolean;
  code: number;
  message: string;
  data?: T;
}

export function printEnvelope<T>(envelope: CommandEnvelope<T>, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${envelope.message}\n`);
  if (envelope.data !== undefined) {
    process.stdout.write(`${JSON.stringify(envelope.data, null, 2)}\n`);
  }
}
