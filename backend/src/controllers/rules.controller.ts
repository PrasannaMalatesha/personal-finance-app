import type { RulesService } from '../services/rules.service';
import { CreateRuleInput, LearnRuleInput, UpdateRuleInput } from '../schemas/rules';
import type { AuthedRequest } from '../lib/handler';

export interface RulesController {
  list(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  create(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  update(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  remove(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
  learn(req: AuthedRequest): Promise<{ status: number; body: unknown }>;
}

export function createRulesController(service: RulesService): RulesController {
  return {
    async list(req) {
      const rules = await service.list(req.user.id);
      return { status: 200, body: { data: rules } };
    },

    async create(req) {
      const input = CreateRuleInput.parse(req.body);
      const rule = await service.create(req.user.id, input);
      return { status: 201, body: { data: rule } };
    },

    async update(req) {
      const input = UpdateRuleInput.parse(req.body);
      const rule = await service.update(req.user.id, req.params.id!, input);
      return { status: 200, body: { data: rule } };
    },

    async remove(req) {
      await service.remove(req.user.id, req.params.id!);
      return { status: 204, body: undefined };
    },

    async learn(req) {
      const input = LearnRuleInput.parse(req.body);
      const result = await service.learnRule(req.user.id, input);
      return { status: 201, body: { data: result } };
    },
  };
}
