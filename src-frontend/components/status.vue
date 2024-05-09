<template>
  <div class="job-items">
    <Empty/>
  </div>
</template>

<script>
import { Square, Sync } from 'kui-icons';
export default {
  computed: {
  },
  data() {
    return {
      Square, Sync
    }
  },
  methods: {
    stopBuild(item) {
      item.loading = true
      this.$http.get('/api/jenkins/stop-build', { job_id: item.number }).then(() => {
        item.progress = 100

        this.$Message.info('已停止构建')
      }).catch(() => { })
    }
  }
}
</script>

<style lang="less">
.job-items {
  width: 230px;
  min-height: 200px;
  padding: 10px;
  background-color: var(--kui-color-control-10);
  box-shadow: 0 0 10px #00000033;
  border-radius: 8px;

  .title {
    display: flex;
    justify-content: space-between;

    .number {
      font-weight: bold;
      font-size: 14px;

      a {
        text-decoration: none;
        color: var(--kui-color-main);
      }
    }

    .time {
      color: #999;
    }
  }

  .item {
    border-bottom: 1px solid var(--kui-color-border);
    padding: 5px;
  }
}
</style>