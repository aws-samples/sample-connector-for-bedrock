<template>
  <Space class="home" vertical block>
    <StatCard :title="$t('home.title')" :items="items1" />
    <StatCard statNumberType="rollup" :title="$t('home.all')" :items="items2" />
  </Space>
</template>
<script setup>
import { ref, computed, onMounted, getCurrentInstance, inject } from "vue";
defineOptions({
  name: "Home",
});
import { message } from "kui-vue";
const { proxy } = getCurrentInstance();
const loading = ref(false);
const my_info = ref({});
const total_info = ref({});
const $t = inject("$t");

const is_admin = computed(() => {
  return localStorage.getItem("role") == "admin";
});

const items1 = ref([
  { value: 0, precision: 2, suffix: "USD", desc: $t("home.total_fee") },
  { value: 0, precision: 2, suffix: "USD", desc: $t("home.month_fee") },
  { value: 0, precision: 2, suffix: "USD", desc: $t("home.month_quota") },
  { value: 0, precision: 2, suffix: "USD", desc: $t("home.balance") },
]);
const items2 = ref([
  { value: 0, precision: 0, suffix: "USD", desc: $t("home.total_fee") },
  { value: 0, precision: 0, suffix: "USD", desc: $t("home.total_month_fee") },
  { value: 0, precision: 0, desc: $t("home.count_key") },
  { value: 0, precision: 0, desc: $t("home.active_key") },
  { value: 0, precision: 0, desc: $t("home.active_key_this_month") },
]);
const get_precision = (value) => {
  if (!value) return 0;
  return Number(value).toString().split(".")[1]?.length;
};
const host = localStorage.getItem("host");
const key = localStorage.getItem("key");

const getMineInfo = () => {
  proxy.$http
    .get(host + "/user/api-key/mine", null, key)
    .then(({ data, success }) => {
      if (success) {
        my_info.value = data;
        const { total_fee, month_fee, month_quota, balance } = data;
        items1.value[0].precision = get_precision(total_fee);
        items1.value[0].value = total_fee * 1;
        items1.value[1].precision = get_precision(month_fee);
        items1.value[1].value = month_fee * 1;
        items1.value[2].precision = get_precision(month_quota);
        items1.value[2].value = month_quota * 1;
        items1.value[3].precision = get_precision(balance);
        items1.value[3].value = balance * 1;
      } else {
        message.info(data);
      }
    })
    .finally(() => {
      loading.value = false;
    });
};
const getAllInfo = () => {
  if (is_admin.value) {
    proxy.$http.get(host + "/admin/statistics/total", null, key).then(({ success, data }) => {
      // console.log("total:", res);
      if (success) {
        total_info.value = data;
        const { total_fee, total_month_fee, count_key, active_key, active_key_this_month } = data;
        items2.value[0].precision = get_precision(total_fee);
        items2.value[0].value = total_fee * 1;
        items2.value[1].precision = get_precision(total_month_fee);
        items2.value[1].value = total_month_fee * 1;
        items2.value[2].precision = get_precision(count_key);
        items2.value[2].value = count_key * 1;
        items2.value[3].precision = get_precision(active_key);
        items2.value[3].value = active_key * 1;
        items2.value[4].precision = get_precision(active_key_this_month);
        items2.value[4].value = active_key_this_month * 1;
      } else {
        message.info(data);
      }
    });
  }
};
onMounted(() => {
  const validHost = host && (host.indexOf("http://") === 0 || host.indexOf("https://") === 0);
  if (!validHost) {
    return false;
  }
  getMineInfo();
  getAllInfo();
});
</script>
