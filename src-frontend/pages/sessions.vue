<template>
  <div class="my-sessions">
    <Space>
      <Button @click="get_data">{{ $t("sessions.btn_refresh") }}</Button>
    </Space>
    <Table
      :data="items"
      :columns="columns"
      :loading="loading"
      :scroll="{ y: `calc(100vh - 230px)` }"
    >
      <template #action="{ record }">
        <Tooltip placement="top" :title="$t('menu.chat_list')">
          <Button :icon="ChatboxEllipses" @click="threadDetail(record)" />
        </Tooltip>
      </template>
    </Table>
    <Page :current="page" :total="total" @change="change" :page-size="size" />
  </div>
</template>
<script setup>
import { ref, onMounted, getCurrentInstance, inject } from "vue";
import { ChatboxEllipses } from "kui-icons";
import { useRouter, useRoute } from "vue-router";
const router = useRouter();
const route = useRoute();
const $t = inject("$t");
defineOptions({
  name: "userSessions",
});
const { proxy } = getCurrentInstance();
const items = ref([]);
const page = ref(1);
const size = ref(15);
const total = ref(0);
const loading = ref(false);

const columns = [
  { key: "title", title: $t("sessions.col_title"), width: 200, ellipsis: true },
  { key: "key_id", title: $t("sessions.col_key_id") },
  {
    key: "total_in_tokens",
    title: $t("sessions.col_total_in_tokens"),
    sorter: true,
  },
  {
    key: "total_out_tokens",
    title: $t("sessions.col_total_out_tokens"),
    sorter: true,
  },
  { key: "total_fee", title: $t("sessions.col_total_fee"), sorter: true },
  { key: "created_at", title: $t("common.created_at"), sorter: true },
  { key: "updated_at", title: $t("common.updated_at"), sorter: true },
  { key: "action", title: $t("common.action"), fixed: "right" },
];

const change = (pageVal) => {
  page.value = pageVal;
  get_data();
};

const get_data = () => {
  loading.value = true;
  let apiUrl = "/admin/session/list";
  if (route.path.startsWith("/user")) {
    apiUrl = "/user/session/list";
  }
  let { page: currentPage, size: currentSize } = {
    page: page.value,
    size: size.value,
  };
  proxy.$http
    .get(apiUrl, {
      limit: currentSize,
      offset: (currentPage - 1) * currentSize,
    })
    .then((res) => {
      let itemsData = res.data.items;
      itemsData.map((item) => {
        item.total_fee = parseFloat(item.total_fee);
        item.created_at = new Date(item.created_at).toLocaleString();
        item.updated_at = new Date(item.updated_at).toLocaleString();
        return item;
      });
      total.value = res.data.total * 1;
      items.value = itemsData;
    })
    .finally(() => {
      loading.value = false;
    });
};

const threadDetail = (row) => {
  let newPath = "adminThreads";
  if (route.path.startsWith("/user")) {
    newPath = "userThreads";
  }
  router.push({ name: newPath, params: { session_id: row.id } });
};

onMounted(() => {
  get_data();
});
</script>
<style lang="less">
.my-sessions {
  th {
    word-break: keep-all !important;
  }
}
</style>
