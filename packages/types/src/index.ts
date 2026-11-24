import { z } from "zod/v3";
export const Roles = ["OWNER", "MANAGER", "EMPLOYEE", "SUPER_ADMIN"] as const;
export type Role = (typeof Roles)[number];
export const criteria = [
  { id: "accuracy", label: "Точность по источнику", max: 40 },
  { id: "completeness", label: "Полнота действий", max: 30 },
  { id: "application", label: "Применение к ситуации", max: 30 },
];
export const AssignmentSchema = z
  .object({
    summary: z.string(),
    question: z.string(),
    evidence: z.array(z.string()).min(1),
  })
  .strict();
export const EvaluationSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    criteria: z.array(
      z
        .object({
          id: z.string(),
          score: z.number().int().min(0).max(40),
          explanation: z.string(),
        })
        .strict(),
    ),
    evidence: z.array(z.string()),
    unsupported_claims: z.array(z.string()),
    gaps: z.array(z.string()),
    feedback: z.string(),
    recommendations: z.array(z.string()).min(1),
    personal_material: z.string(),
  })
  .strict();
export type AssignmentContent = z.infer<typeof AssignmentSchema>;
export type Evaluation = z.infer<typeof EvaluationSchema>;
export const LoginSchema = z
  .object({
    email: z.string().email().max(200),
    password: z.string().min(10).max(128),
  })
  .strict();
export const RegisterSchema = LoginSchema.extend({
  name: z.string().min(2).max(100),
  companyName: z.string().min(2).max(100),
});
export const MaterialSchema = z
  .object({
    title: z.string().min(3).max(150),
    text: z.string().min(60).max(12000),
  })
  .strict();
export const UserSchema = LoginSchema.extend({
  name: z.string().min(2).max(100),
  role: z.enum(["MANAGER", "EMPLOYEE"]),
  limit: z.number().int().min(0).max(10000000),
});
export const AnswerSchema = z
  .object({ answer: z.string().min(10).max(8000) })
  .strict();
export const TopUpSchema = z
  .object({
    amount: z.number().int().min(1000).max(10000000),
    key: z.string().uuid(),
  })
  .strict();
export const LimitSchema = z
  .object({ limit: z.number().int().min(0).max(10000000) })
  .strict();
export interface UserView {
  id: string;
  name: string;
  email: string;
  role: Role;
  companyId: string | null;
  limit: number;
  spent: number;
}
export interface MaterialView {
  id: string;
  title: string;
  text: string;
  createdAt: string;
}
export interface AssignmentView {
  id: string;
  materialId: string;
  content: AssignmentContent;
  material: MaterialView;
  criteria: typeof criteria;
}
export interface AttemptView {
  id: string;
  answer: string;
  evaluation: Evaluation;
  createdAt: string;
  user: { name: string; email: string };
  assignment: { content: AssignmentContent };
}
export interface TransactionView {
  id: string;
  amount: number;
  kind: string;
  createdAt: string;
  companyId: string;
  userId: string | null;
}
export interface Dashboard {
  user: UserView;
  company: { id: string; name: string; balance: number } | null;
  materials: MaterialView[];
  assignments: AssignmentView[];
  attempts: AttemptView[];
  users: UserView[];
  transactions: TransactionView[];
  operations: {
    id: string;
    status: string;
    cost: number;
    reserved: number;
    createdAt: string;
  }[];
}

export const AI_RESERVE_CREDITS = 100000;
