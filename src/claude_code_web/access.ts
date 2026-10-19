export const RUNTIME_ANTHROPIC_PROVIDER = 'bedrock-runtime-anthropic';

// True when the key itself, or its group, is bound to at least one bedrock-runtime-anthropic model.
// The provider filter is in SQL (no row limit). A key without a group (group_id 0/null) has no group
// bindings: the group query must not run, because an empty group filter would match every group.
export async function hasRuntimeAnthropicModel(db: any, user: any): Promise<boolean> {
    if (await db.exists('eiai_v_key_model', {
        where: 'key_id=$1 and provider=$2',
        params: [user.id, RUNTIME_ANTHROPIC_PROVIDER],
    })) return true;
    if (!user.group_id) return false;
    return db.exists('eiai_v_group_model', {
        where: 'group_id=$1 and provider=$2',
        params: [user.group_id, RUNTIME_ANTHROPIC_PROVIDER],
    });
}
