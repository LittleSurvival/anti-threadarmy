export interface AccountResult {
  username: string;
  profiles: { name: string; platform: string; avatarUrl: string | null }[];
  contacts: { type: string; value: string }[];
  fetchedAt: string;
}
export function queryThreads(username: string): Promise<AccountResult>;
export function phoneLabel(value: string): string;
export function contactDetails(contacts: AccountResult["contacts"]): {
  phoneRegions: string[];
  possiblePhoneRegions: string[];
  providers: string[];
  possibleProviders: string[];
};
export type ThreadsTarget =
  { username: string; shareUrl?: never } | { shareUrl: string; username?: never };
export function parseThreadsInput(input: string): ThreadsTarget;
export function resolveThreadsInput(target: ThreadsTarget): Promise<string>;
export interface ErrorReport {
  version: number;
  timestamp: string;
  stage: string;
  name: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  response?: {
    url?: string;
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: string;
  };
}
export function createErrorReport(error: unknown, details?: Partial<ErrorReport>): ErrorReport;
export function errorWithReport(message: string, report?: unknown): Error & { report: ErrorReport };
