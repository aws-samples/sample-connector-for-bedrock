<template>
  <div class="container">
    <Space>
      <Button @click="get_data">{{ $t('keys.btn_query') }}</Button>
      <Button @click="add">{{ $t('keys.btn_new') }}</Button>
    </Space>
    <Table :data="items" :columns="columns" :loading="loading">
      <template v-slot:action="c, row">
        <Space>
          <Button size="small" type="warning" @click="edit(row)">{{ $t('keys.btn_edit') }}</Button>
          <Popconfirm :title="$t('webhook.tip_delete')" @ok="del(row)" :width="260">
            <Button size="small" type="danger">{{ $t('common.btn_delete') }}</Button>
          </Popconfirm>
          <Button size="small" type="primary" @click="detail(row)">{{ $t('keys.btn_detail') }}</Button>
        </Space>
      </template>
    </Table>
    <Page :current="page" :total="total" @change="change" :page-size="size"/>
    <Drawer :title="title" v-model="show" @ok="save" :loading="saving" :mask-closable="true">
      <div>
        <Form :model="form" :rules="rules" layout="horizontal" ref="form" theme="light" :labelCol="{span:5}"
              :wrapperCol="{span:18}">
          <FormItem :label="this.$t('webhook.name')" prop="name">
            <Input :readonly="action == 'detail'"/>
          </FormItem>
          <FormItem :label="this.$t('webhook.provider')" prop="provider">
            <Select :width="200" :options="providers" :disabled="action == 'detail'">
            </Select>
          </FormItem>
          <FormItem :label="this.$t('webhook.config')" prop="config">
            <TextArea :rows="8" :readonly="action == 'detail'"/>
          </FormItem>
        </Form>
      </div>
    </Drawer>
  </div>
</template>

<script>

export default {
  name: 'Webhook',
  data() {
    return {
      providers: [],
      items: [],
      title: '',
      columns: [
        {key: 'name', title: this.$t('webhook.name')},
        {key: 'provider', title: this.$t('webhook.provider')},
        // {key: 'config', title: this.$t('webhook.config')},
        {key: 'action', title: this.$t('keys.col_action')},
      ],
      form: {name: '', provider: '', config: '', id: 0},
      rules: {
        name: [{required: true}],
        provider: [{required: true}]
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
      let {page, size} = this
      this.$http.get('/admin/bot-connector/list', {limit: size, offset: (page - 1) * size}).then(res => {
        let items = res.data.items
        items.map(item => {
          item.config = JSON.stringify(item.config, null, 2);
          item.created_at = new Date(item.created_at).toLocaleString();
          item.updated_at = new Date(item.updated_at).toLocaleString();
          return item;
        });
        this.$http.get('/admin/bot-connector/list-providers').then(res => {
          this.providers = res.data.map(provider => ({label: provider, value: provider}));
        }).finally(() => {
          this.loading = false;
        });
        this.total = parseInt(res.data.total)
        this.items = items
      }).finally(() => {
        this.loading = false
      });
    },
    edit(row) {
      this.form = {...row}
      this.title = this.$t('common.edit')
      this.action = 'edit'
      this.show = true
    },
    add() {
      this.action = 'new'
      this.title = this.$t('common.new')
      this.show = true;
      this.form.id = 0;
      setTimeout(() => this.$refs.form.reset(), 10);
    },
    detail(row) {
      this.form = {...row}
      this.action = 'detail'
      this.title = this.$t('common.detail')
      this.show = true
    },

    del(row) {
      this.loading = true;
      console.log(row.id)
      this.$http.post("/admin/bot-connector/delete", {id: row.id}).then(() => {
        this.$Message.success("Delete successfully.");
        this.get_data();
      }).finally(() => {
        this.loading = false;
      });
    },
    save() {
      if (this.action == 'detail') {
        this.show = false;
        return false;
      }
      this.$refs.form.validate(v => {
        if (v) {
          this.saving = true
          let {id, name, config, provider} = this.form;
          this.$http.post('/admin/bot-connector/save', {
            id,
            name,
            config,
            provider
          }).then(() => {
            this.show = false
            this.$Message.success("Save successfully.")
            this.get_data();
          }).finally(() => {
            this.saving = false;
          });
        }
      })
    }
  }
}
</script>

<style scoped lang="less">

</style>
