export class WorkspaceCredentialStore {
  constructor(options: { directory: string; encryptionKey: string | undefined })
  read(scope: any, provider: string): Promise<any>
  modify(scope: any, provider: string, update: (current: any) => Promise<any>): Promise<any>
  delete(scope: any, provider: string): Promise<void>
}
export function startOpenAIDeviceAuthorization(options: any): Promise<any>
export function deviceAuthorizationStatus(scope: any, id: string): any
export function resolveOpenAICodexCredential(options: any): Promise<any>
