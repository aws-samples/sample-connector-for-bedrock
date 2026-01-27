<template>
  <div class="model-list">
    <Checkbox
      v-for="item in models"
      :key="item.value"
      :label="item.label"
      :checked="checked_models.includes(item.value)"
      :value="item.value"
      @change="setModel"
    />
  </div>
</template>
<script setup>
import { getCurrentInstance } from "vue";
import { message } from "kui-vue";
const { proxy } = getCurrentInstance();
const props = defineProps({
  type: String,
  group_id: {
    type: Number,
  },
  key_id: {
    type: Number,
  },
  models: {
    type: Array,
    default: () => [],
  },
  checked_models: {
    type: Array,
    default: () => [],
  },
});
const updateGroupModel = ({ value }) => {
  proxy.$http
    .post("/admin/group/bind-or-unbind-model", {
      group_id: props.group_id,
      model_id: value,
    })
    .then(() => {
      message.success("Updated successfully.");
    })
};
const updateApiKeyModel = ({ value }) => {
  proxy.$http
    .post("/admin/api-key/bind-or-unbind-model", {
      key_id: props.key_id,
      model_id: value,
    })
    .then(() => {
      message.success("Updated successfully.");
    })
};
const setModel = (item) => {
  if (props.type === "group") {
    updateGroupModel(item);
  } else {
    updateApiKeyModel(item);
  }
};
</script>
<style scoped lang="less">
.model-list {
  display: flex;
  flex-wrap: wrap;
  .k-checkbox {
    padding: 8px;
    border: 1px solid var(--kui-color-pop-border);
    width: 180px;
    margin: -1px 0 0 -1px;
  }
}
</style>
