<template>
  <div class="home">
    <Card :title="$t('home.title')" :bordered="false">
      <Space class="items" wrap>
        <div class="item">
          <span class="key">{{ $t('home.total_fee') }}</span>
          <span class="value">{{ parseFloat(my_info.total_fee || 0) }}<span class="sub">USD</span></span>
        </div>
        <div class="item">
          <span class="key">{{ $t('home.month_fee') }}</span>
          <span class="value">{{ parseFloat(my_info.month_fee || 0) }}<span class="sub">USD</span></span>
        </div>
        <div class="item">
          <span class="key">{{ $t('home.month_quota') }}</span>
          <span class="value">{{ parseFloat(my_info.month_quota || 0) }}<span class="sub">USD</span></span>
        </div>
        <div class="item">
          <span class="key">{{ $t('home.balance') }}</span>
          <span class="value">{{ parseFloat(my_info.balance || 0) }}<span class="sub">USD</span></span>
        </div>
      </Space>
    </Card>

    <Card :title="$t('home.all')" :bordered="false" v-if="is_admin">
      <Space class="items" wrap>
        <div class="item">
          <span class="key">{{ $t('home.total_fee') }}</span>
          <span class="value">{{ parseFloat(total_info.total_fee || 0) }}<span class="sub">USD</span></span>
        </div>
        <div class="item">
          <span class="key">{{ $t('home.total_month_fee') }}</span>
          <span class="value">{{ parseFloat(total_info.total_month_fee || 0) }}<span class="sub">USD</span></span>
        </div>
        <div class="item">
          <span class="key">{{ $t('home.count_key') }}</span>
          <span class="value">{{ total_info.count_key }}</span>
        </div>
        <div class="item">
          <span class="key">{{ $t('home.active_key') }}</span>
          <span class="value">{{ total_info.active_key }}</span>
        </div>
        <div class="item">
          <span class="key">{{ $t('home.active_key_this_month') }}</span>
          <span class="value">{{ total_info.active_key_this_month }}</span>
        </div>
      </Space>
    </Card>
  </div>
</template>
<script>
export default {
  data() {
    return {
      loading: false,
      my_info: {},
      total_info: {},
    }
  },
  computed: {
    is_admin() {
      return localStorage.getItem('role') == 'admin'
    }
  },
  created() {
    const host = localStorage.getItem("host");
    const key = localStorage.getItem("key");
    localStorage.setItem("host", host);
    this.$http.get(host + '/user/api-key/mine', null, key).then(res => {
      if (res.success) {
        this.my_info = res.data;
      } else {
        alert(res.data);
      }
      if (this.is_admin) {
        this.$http.get(host + '/admin/statistics/total', null, key).then(res => {
          console.log('total:', res)
          if (res.success) {
            this.total_info = res.data;
          } else {
            alert(res.data);
          }
        })
      }
    }).finally(() => {
      this.loading = false
    });
  },
  methods: {

  }
}
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