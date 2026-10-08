// Error con código HTTP; sin dependencias para poder usarlo en pruebas sin entorno.
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
