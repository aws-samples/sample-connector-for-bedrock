<template>
  <div class="my-keys">
    <Space>
      <Button @click="get_data">{{ $t('keys.btn_query') }}</Button>
      <Button @click="add">{{ $t('keys.btn_new') }}</Button>
      <Button @click="imports">{{ $t('keys.btn_import') }}</Button>
    </Space>
    <Table :data="items" :columns="columns" :loading="loading">
      <template v-slot:api_key="c, row">
        <Space>
          {{ format_key(row) }}
          <Tooltip :title="$t('keys.tip_copy_key')">
            <Button :icon="Copy" theme="normal" size="small" @click="copy(row)" />
          </Tooltip>
        </Space>
      </template>
      <template v-slot:action="c, row">
        <Space>
          <Button size="small" @click="recharge(row)">{{ $t('keys.btn_recharge') }}</Button>
          <Button size="small" @click="edit(row)">{{ $t('keys.btn_edit') }}</Button>
        </Space>
      </template>
    </Table>
    <Page :current="page" :total="total" @change="change" :page-size="size" />
    <Modal :title="title" v-model="show" @ok="save" :loading="saving">
      <Form :model="form" :rules="rules" layout="vertical" ref="form" theme="light">
        <FormItem :label="this.$t('keys.col_name')" prop="name">
          <Input placeholder="Name" :readonly="action == 'recharge'" />
        </FormItem>
        <FormItem :label="this.$t('keys.col_email')" prop="email" :readonly="action == 'recharge'">
          <Input placeholder="Email" />
        </FormItem>
        <FormItem :label="this.$t('keys.col_role')" prop="role" v-if="action != 'recharge'">
          <Select :width="200" placeholder="Role">
            <Option value="user" :label="$t('keys.op_normal')" />
            <Option value="admin" :label="$t('keys.op_admin')" />
          </Select>
        </FormItem>
        <FormItem :label="this.$t('keys.col_balance')" prop="balance" v-if="action == 'recharge'">
          <Input placeholder="Balance" />
        </FormItem>
        <FormItem :label="this.$t('keys.col_month_quota')" prop="month_quota" v-if="action != 'recharge'">
          <Input />
        </FormItem>
      </Form>
    </Modal>
  </div>
</template>
<script>
import { Copy } from 'kui-icons'
export default {
  name: 'AdminKeys',
  data() {
    return {
      Copy,
      items: [],
      title: '',
      columns: [
        { key: 'name', title: this.$t('keys.col_name') },
        { key: 'api_key', title: this.$t('keys.col_key') },
        { key: 'email', title: this.$t('keys.col_email') },
        { key: 'role', title: this.$t('keys.col_role') },
        { key: 'total_fee', title: this.$t('keys.col_total_fee') },
        { key: 'balance', title: this.$t('keys.col_balance') },
        { key: 'month_fee', title: this.$t('keys.col_month_fee') },
        { key: 'month_quota', title: this.$t('keys.col_month_quota') },
        // { key: 'created_at', title: 'Date' },
        { key: 'action', title: this.$t('keys.col_action') },
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
    copy({ api_key }) {
      this.$copyText(api_key).then(e => {
        this.$Message.success('Copied')
      }, e => {
        this.$Message.error('Copied faild.')
      })
    },
    format_key({ api_key }) {
      return api_key ? api_key.substr(0, 5) + '...' + api_key.substr(-3) : ""
    },
    imports() {

    },
    change(page) {
      this.page = page
      this.get_data()
    },
    get_data() {
      this.loading = true
      let { page, size } = this
      this.$http.get('/admin/api-key/list', { limit: size, offset: (page - 1) * size }).then(res => {
        let items = res.data.items
        items.map(item => {
          item.total_fee = parseFloat(item.total_fee)
          item.balance = parseFloat(item.balance)
          item.month_fee = parseFloat(item.month_fee)
          item.month_quota = parseFloat(item.month_quota)
          return item
        });
        this.total = res.data.total * 1
        this.items = items
      }).finally(() => {
        this.loading = false
      })
    },
    edit(row) {
      this.form = row
      this.title = this.$t('keys.btn_edit')
      this.action = 'edit'
      this.show = true
    },
    recharge(row) {
      this.form = row
      this.title = this.$t('keys.btn_recharge')
      this.action = 'recharge'
      this.show = true
    },
    add() {
      this.action = 'new'
      this.title = this.$t('keys.btn_new')
      this.show = true
      this.form.id = 0;
      this.form.role = 'user'
      this.$nextTick(() => {
        this.$refs.form.reset()
      })
    },
    save() {
      this.$refs.form.validate(v => {
        if (v) {
          this.saving = true
          if (this.action == 'recharge') {
            let { id, balance } = this.form
            this.$http.post('/admin/api-key/recharge', { id, balance }).then(res => {
              this.show = false
              this.$Message.success("Save successfuly.")
            }).finally(() => {
              this.saving = false
            })
            return
          }
          const apiPath = this.action == 'new' ? "/admin/api-key/apply" : "/admin/api-key/update";
          this.$http.post(apiPath, this.form).then(res => {
            this.show = false
            this.$Message.success("Save successfuly.")
            this.get_data()
          }).finally(() => {
            this.saving = false
          })
        }
      })

    }
  }
}
</script>
<style lang="less">
.my-keys {
  padding: 20px;

  th {
    word-break: keep-all !important;
  }
}
</style>