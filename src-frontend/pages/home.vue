<template>
  <div class="home">
    <Card :title="$t('home.title')" :bordered="false">
      <Space class="items" wrap>
        <div class="item">
          <span class="key">{{ $t("home.total_fee") }}</span>
          <span class="value"
            >{{ parseFloat(my_info.total_fee || 0)
            }}<span class="sub">USD</span></span
          >
        </div>
        <div class="item">
          <span class="key">{{ $t("home.month_fee") }}</span>
          <span class="value"
            >{{ parseFloat(my_info.month_fee || 0)
            }}<span class="sub">USD</span></span
          >
        </div>
        <div class="item">
          <span class="key">{{ $t("home.month_quota") }}</span>
          <span class="value"
            >{{ parseFloat(my_info.month_quota || 0)
            }}<span class="sub">USD</span></span
          >
        </div>
        <div class="item">
          <span class="key">{{ $t("home.balance") }}</span>
          <span class="value"
            >{{ parseFloat(my_info.balance || 0)
            }}<span class="sub">USD</span></span
          >
        </div>
      </Space>
    </Card>

    <Card :title="$t('home.all')" :bordered="false" v-if="is_admin">
      <Space class="items" wrap>
        <div class="item">
          <span class="key">{{ $t("home.total_fee") }}</span>
          <span class="value"
            >{{ parseFloat(total_info.total_fee || 0)
            }}<span class="sub">USD</span></span
          >
        </div>
        <div class="item">
          <span class="key">{{ $t("home.total_month_fee") }}</span>
          <span class="value"
            >{{ parseFloat(total_info.total_month_fee || 0)
            }}<span class="sub">USD</span></span
          >
        </div>
        <div class="item">
          <span class="key">{{ $t("home.count_key") }}</span>
          <span class="value">{{ total_info.count_key }}</span>
        </div>
        <div class="item">
          <span class="key">{{ $t("home.active_key") }}</span>
          <span class="value">{{ total_info.active_key }}</span>
        </div>
        <div class="item">
          <span class="key">{{ $t("home.active_key_this_month") }}</span>
          <span class="value">{{ total_info.active_key_this_month }}</span>
        </div>
      </Space>
    </Card>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, getCurrentInstance, inject } from "vue";
import { message } from "kui-vue";
const { proxy } = getCurrentInstance();
const loading = ref(false);
const my_info = ref({});
const total_info = ref({});
const $t = inject("$t");

const is_admin = computed(() => {
  return localStorage.getItem("role") == "admin";
});

onMounted(() => {
  const host = localStorage.getItem("host");
  const key = localStorage.getItem("key");
  const validHost =
    host && (host.indexOf("http://") === 0 || host.indexOf("https://") === 0);
  if (!validHost) {
    return false;
  }
  proxy.$http
    .get(host + "/user/api-key/mine", null, key)
    .then((res) => {
      if (res.success) {
        my_info.value = res.data;
      } else {
        message(res.data);
      }
      if (is_admin.value) {
        proxy.$http
          .get(host + "/admin/statistics/total", null, key)
          .then((res) => {
            console.log("total:", res);
            if (res.success) {
              total_info.value = res.data;
            } else {
              message(res.data);
            }
          });
      }
    })
    .finally(() => {
      loading.value = false;
    });
});
</script>
<style lang="less">
.home {
  padding: 20px;

  .items {
    width: 100%;
  }

  .item {
    background: var(--kui-color-gray-90);
    border-radius: 16px;
    flex: 1;
    padding: 20px;
    display: flex;
    flex-direction: column;

    .key {
      font-weight: bold;
      margin-right: 10px;
      white-space: nowrap;
    }

    .value {
      margin-top: 8px;
    }

    .sub {
      color: var(--kui-color-gray-30);
      font-size: 12px;
      margin-left: 8px;
    }
  }

  .k-card {
    margin-bottom: 20px;

    .k-card-head {
      border: none;
    }
  }
}
</style>
