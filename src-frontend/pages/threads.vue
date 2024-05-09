
<template>
  <div class="my-threads">
    <Space>
      <Button @click="get_data">{{ $t('sessions.btn_refresh') }}</Button>
    </Space>
    <Table :data="items" :columns="columns" :loading="loading">
      <template v-slot:prompt="value">
        <Poptip title="提示词" trigger="click">
          <template slot="content">
            <pre>{{ value }}</pre>
          </template>
          <Button :icon="Copy" theme="normal" size="small" />
        </Poptip>
        {{ format_content(value) }}
      </template>
      <template v-slot:completion="value">
        <Poptip title="回复" trigger="click">
          <template slot="content">
            <pre>{{ value }}</pre>
          </template>
          <Button :icon="Copy" theme="normal" size="small" />
        </Poptip>
        {{ format_content(value) }}
      </template>

    </Table>
    <Page :current="page" :total="total" @change="change" :page-size="size" />
  </div>
</template>
<script>
import { Copy } from 'kui-icons'
export default {
  name: 'AdminThreads',
  data() {
      // {
      //   "id": 137,
      //   "prompt": "简要总结一下对话内容，用作后续的上下文提示 prompt，控制在 200 字以内",
      //   "completion": "是的,如果目标 SQL Server 实例不支持 Named Instance,您可以忽略连接字符串中的 `\\SBIPNR` 部分。\n\n对于不支持 Named Instance 的 SQL Server 实例,JDBC 连接字符串的格式应为:\n\n```\njdbc:sqlserver://hostname:port;databaseName=DatabaseName\n```\n\n因此,在您的情况下,如果目标 SQL Server 实例不支持 Named Instance,您可以尝试使用以下连接字符串:\n\n```\njdbc:sqlserver://sbi.db.swirecocacola.com:1433;databaseName=FSV\n```\n\n注意:\n- 我移除了 `\\SBIPNR` 部分\n- 添加了默认 SQL Server 端口 `:1433`。如果您的实例使用不同端口,请相应更改。\n\n通过这种方式,您的应用程序将尝试连接到指定主机上的默认 SQL Server 实例,而不是 Named Instance。\n\n如果连接成功,那么您就无需更改应用程序代码,只需更新连接字符串即可。但是,如果连接失败,您可能需要检查目标 SQL Server 实例的配置和防火墙规则等。",
      //   "session_id": 23,
      //   "tokens_in": 1044,
      //   "tokens_out": 355,
      //   "fee": "0.0084570000"
      // }
    return {
      Copy,
      items: [],
      title: '',
      columns: [
        { key: 'session_id', title: this.$t('threads.col_session_id')},
        { key: 'id', title: this.$t('threads.col_id')},
        { key: 'prompt', title: this.$t('threads.col_prompt'), width:200, ellipsis:true },
        { key: 'completion', title: this.$t('threads.col_completion'), width:200, ellipsis:true  },
        { key: 'tokens_in', title: this.$t('threads.col_tokens_in')},
        { key: 'tokens_out', title: this.$t('threads.col_tokens_out')},
        { key: 'fee', title: this.$t('threads.col_fee')}
      ],
      show: false,
      page: 1,
      size: 15,
      total: 0,
      loading: false,
      saving: false,
    }
  },
  mounted() {
    this.get_data()
  },
  methods: {

    change(page) {
      this.page = page
      this.get_data()
    },
    format_content(value) {
      return value ? value.substr(0, 10) + '...' + value.substr(-3) : ""
    },
    get_data() {
      this.loading = true
      let apiUrl = '/admin/thread/list'
      if(this.$route.path.startsWith('/user')) {
        apiUrl = '/user/thread/list'
      }
      let sessionId = this.$route.params.session_id
      let { page, size } = this
      this.$http.get(apiUrl, { session_id: sessionId, limit: size, offset: (page - 1) * size }).then(res => {
        let items = res.data.items
        items.map(item => {
          item.fee = parseFloat(item.fee)
          return item
        });
        this.total = res.data.total * 1
        this.items = items
      }).finally(() => {
        this.loading = false
      })
    },
    threadDetail(row) {
      this.$router.push('thread', {session_id: row.id})
    }
  }
}
</script>
<style lang="less">
.my-threads {
  padding: 20px;

  th {
    word-break: keep-all !important;
  }
}

.k-poptip-content {
  max-width: 400px;
  pre {
    white-space: pre-line;
  }
}
</style>