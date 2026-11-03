export interface AccountResult {
  username: string;
  profiles: { name: string; platform: string; avatarUrl: string | null }[];
  contacts: { type: string; value: string }[];
  fetchedAt: string;
}
export function queryThreads(username: string): Promise<AccountResult>;
