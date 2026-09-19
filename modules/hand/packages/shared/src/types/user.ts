export interface User {
  id: string;
  name?: string;
  email?: string;
  avatar?: string;
  wechatId?: string;
  plan: UserPlan;
  quota: UserQuota;
  createdAt: Date;
}

export type UserPlan = "free" | "pro" | "enterprise";

export interface UserQuota {
  monthlyGenerations: number;
  usedGenerations: number;
  storageBytes: number;
  usedStorageBytes: number;
}
