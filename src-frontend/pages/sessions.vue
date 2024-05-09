<template>
  <div class="my-sessions">
    <Space>
      <Button @click="get_data">{{ $t('sessions.btn_refresh') }}</Button>
    </Space>
    <Table :data="items" :columns="columns" :loading="loading">
      <template v-slot:action="c, row">
        <Tooltip placement="top-right" :title="'对话'">
          <Button :icon="ChatboxEllipses" theme="normal" @click="threadDetail(row)" />
        </Tooltip>
      </template>
    </Table>
    <Page :current="page" :total="total" @change="change" :page-size="size" />
  </div>
</template>
<script>
import { ChatboxEllipses } from 'kui-icons'
export default {
  name: 'AdminSessions',
  data() {
    return {
      ChatboxEllipses,
      items: [],
      title: '',
      columns: [
        { key: 'title', title: this.$t('sessions.col_title'), width:200, ellipsis:true },
        { key: 'key_id', title: this.$t('sessions.col_key_id') },
        { key: 'total_in_tokens', title: this.$t('sessions.col_total_in_tokens'), sorter:true },
        { key: 'total_out_tokens', title: this.$t('sessions.col_total_out_tokens'), sorter:true },
        { key: 'total_fee', title: this.$t('sessions.col_total_fee'), sorter:true },
        { key: 'created_at', title: this.$t('sessions.col_created_at'), sorter:true },
        { key: 'updated_at', title: this.$t('sessions.col_updated_at'), sorter:true },
        // { key: 'action', title: this.$t('sessions.col_action') },
      ],
      form: { name: '', email: '', role: 'user', month_quota: '', balance: 0 },
      rules: {
        name: [{ required: true, message: 'Please input name...' }],
      },
      action: "add",
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
    get_data() {
      this.loading = true
      let apiUrl = '/admin/session/list'
      if(this.$route.path.startsWith('/user')) {
        apiUrl = '/user/session/list'
      }
      let { page, size } = this
      this.$http.get(apiUrl, { limit: size, offset: (page - 1) * size }).then(res => {
        let items = res.data.items
        items.map(item => {
          item.total_fee = parseFloat(item.total_fee)
          item.created_at = new Date(item.created_at).toLocaleString()
          item.updated_at = new Date(item.updated_at).toLocaleString()
          return item
        });
        this.total = res.data.total * 1
        this.items = items
      }).finally(() => {
        this.loading = false
      })
    },
    threadDetail(row) {
      let newPath = 'adminThreads'
      if(this.$route.path.startsWith('/user')) {
        newPath = 'userThreads'
      }
      this.$router.push({ name: newPath, params: {session_id: row.id}})
    }
  }
}
</script>
<style lang="less">
.my-sessions {
  padding: 20px;

  th {
    word-break: keep-all !important;
  }
}
</style>