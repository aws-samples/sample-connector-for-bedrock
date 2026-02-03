<template>
  <div class="my-threads">
    <Space>
      <Button @click="get_data">{{ $t("sessions.btn_refresh") }}</Button>
    </Space>
    <Table :data="items" :columns="columns" :loading="loading">
      <template #prompt="{ value }">
        <Poptip :title="$t('threads.col_prompt')" trigger="click" class="spe">
          <template #content>
            <pre>{{ value }}</pre>
          </template>
          <Button :icon="Chatbubble" size="small" />
        </Poptip>
        {{ format_content(value) }}
      </template>
      <template #completion="{ value }">
        <Poptip :title="$t('threads.col_completion')" trigger="click" placement="right" class="spe">
          <template #content>
            <pre>{{ value }}</pre>
          </template>
          <Button :icon="Chatbubble" size="small" />
        </Poptip>
        {{ format_content(value) }}
      </template>
    </Table>
    <Page :current="page" :total="total" @change="change" :page-size="size" />
  </div>
</template>
<script setup>
import { ref, onMounted, getCurrentInstance, inject } from "vue";
import { Chatbubble } from "kui-icons";
const { proxy } = getCurrentInstance();
import { useRoute } from "vue-router";
const route = useRoute();
defineOptions({
  name: "userThreads",
});
const items = ref([]);
const page = ref(1);
const size = ref(15);
const total = ref(0);
const loading = ref(false);
const $t = inject("$t");

const columns = [
  { key: "session_id", title: $t("threads.col_session_id") },
  { key: "id", title: $t("threads.col_id") },
  {
    key: "prompt",
    title: $t("threads.col_prompt"),
    width: 200,
    ellipsis: true,
  },
  {
    key: "completion",
    title: $t("threads.col_completion"),
    width: 200,
    ellipsis: true,
  },
  { key: "tokens_in", title: $t("threads.col_tokens_in") },
  { key: "tokens_out", title: $t("threads.col_tokens_out") },
  { key: "fee", title: $t("threads.col_fee") },
];

onMounted(() => {
  get_data();
});

const change = (pageVal) => {
  page.value = pageVal;
  get_data();
};

const format_content = (value) => {
  return value ? value.substr(0, 10) + "..." + value.substr(-3) : "";
};

const get_data = () => {
  loading.value = true;
  let apiUrl = "/admin/thread/list";
  if (route.path.startsWith("/user")) {
    apiUrl = "/user/thread/list";
  }
  let sessionId = route.params.session_id;
  let { page: pageNum, size: sizeVal } = { page: page.value, size: size.value };
  proxy.$http
    .get(apiUrl, {
      session_id: sessionId,
      limit: sizeVal,
      offset: (pageNum - 1) * sizeVal,
    })
    .then((res) => {
      let itemsData = res.data.items;
      itemsData.map((item) => {
        item.fee = parseFloat(item.fee);
        return item;
      });
      total.value = res.data.total * 1;
      items.value = itemsData;
    })
    .finally(() => {
      loading.value = false;
    });
};
</script>
<style lang="less">
.my-threads {
  padding: 20px;

  th {
    word-break: keep-all !important;
  }
}
.k-poptip-body {
  max-width: 400px;
  max-height: 320px;
  overflow: auto;
  pre {
    white-space: pre-line;
    margin: 0;
    word-break: break-all;
  }
  &::-webkit-scrollbar {
    height: 3px;
    width: 3px;
  }
  &::-webkit-scrollbar-thumb {
    background-color: var(--kui-color-item-hover);
  }
}
</style>
