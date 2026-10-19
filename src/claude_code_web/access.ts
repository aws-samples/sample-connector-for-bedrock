import service from '../service/key';
import serviceGroup from '../service/group';

export const RUNTIME_ANTHROPIC_PROVIDER = 'bedrock-runtime-anthropic';

// True when the key itself, or its group, is bound to at least one bedrock-runtime-anthropic model.
export async function hasRuntimeAnthropicModel(db: any, user: any): Promise<boolean> {
    const keyModels = await service.listModels(db, { key_id: user.id, limit: 1000 });
    if (keyModels.items.some((m: any) => m.provider === RUNTIME_ANTHROPIC_PROVIDER)) return true;
    const groupModels = await serviceGroup.listModels(db, { group_id: user.group_id, limit: 1000 });
    return groupModels.items.some((m: any) => m.provider === RUNTIME_ANTHROPIC_PROVIDER);
}
