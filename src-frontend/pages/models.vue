<template>
  <div class="container">
    <Space>
      <Button @click="get_data">{{ $t('keys.btn_query') }}</Button>
      <Button @click="add">{{ $t('keys.btn_new') }}</Button>
    </Space>
    <Table :data="items" :columns="columns" :loading="loading">
      <template v-slot:price_in="c,row">
        <div style="text-align:right" >
        {{row.price_in}}/{{ $t('common.price_unit') }}
      </div>
      </template> 
      <template v-slot:price_out="c,row">
        <div style="text-align:right" >
        {{row.price_out}}/{{ $t('common.price_unit') }}
      </div>
      </template> 
      <template v-slot:multiple="c,row">
        {{row.multiple?"Y":"N"}}
      </template> 
      <template v-slot:action="c, row">
        <Space>
          <Button size="small" @click="edit(row)">{{ $t('keys.btn_edit') }}</Button>
          <Button size="small" @click="detail(row)">{{ $t('keys.btn_detail') }}</Button>
        </Space>
      </template>
    </Table>
    <Page :current="page" :total="total" @change="change" :page-size="size" />
    <Drawer :title="title" v-model="show" @ok="save" :loading="saving" >
      <div>
      <Form :model="form" :rules="rules" layout="horizontal" ref="form" theme="light" :labelCol="{span:5}" :wrapperCol="{span:18}">
        <FormItem :label="this.$t('model.name')" prop="name">
          <Input :readonly="action == 'detail'" />
        </FormItem>
        <FormItem :label="this.$t('model.provider')" prop="provider">
          <Select :width="200" :options="providers" :disabled="action == 'detail'" >
          </Select>
        </FormItem>
        <FormItem :label="this.$t('model.multiple')" prop="multiple">
          <k-switch />
        </FormItem>
        <FormItem :label="this.$t('model.price_in')" prop="price_in">
          <Input :width="200" placeholder="Price in" :suffix="'/' + $t('common.price_unit')" :readonly="action == 'detail'" >
          </Input>
        </FormItem>
        <FormItem :label="this.$t('model.price_out')" prop="price_out">
          <Input :width="200" placeholder="Price out" :suffix="'/' + $t('common.price_unit')" :readonly="action == 'detail'" >
          </Input>
        </FormItem>
        <FormItem :label="this.$t('model.config')" prop="config">
          <TextArea :rows="8" :readonly="action == 'detail'" />
        </FormItem>
      </Form>
      </div>
    </Drawer>
  </div>
</template>
<script>

export default {
  name: 'Models',
  data() {
    return {
      providers: [],
      items: [],
      title: '',
      columns: [
        { key: 'name', title: this.$t('model.name') },
        { key: 'provider', title: this.$t('model.provider') },
        { key: 'multiple', title: this.$t('model.multiple') },
        { key: 'price_in', title: this.$t('model.price_in')  },
        { key: 'price_out', title: this.$t('model.price_out') },
        { key: 'action', title: this.$t('keys.col_action') },
      ],
      form: { name: '', provider: '', multiple: 0, config: '', price_in: 0, price_out: 0},
      rules: {
        name: [{ required: true }],
        provider: [{ required: true }]
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
      let { page, size } = this
      this.$http.get('/admin/model/list', { limit: size, offset: (page - 1) * size }).then(res => {
        let items = res.data.items
        items.map(item => {
          item.price_in =( item.price_in * 1e6).toFixed(2);
          item.price_out =  (item.price_out * 1e6).toFixed(2);
          item.config = JSON.stringify(item.config, null, 2);
          item.created_at = new Date(item.created_at).toLocaleString();
          item.updated_at = new Date(item.updated_at).toLocaleString();
          return item;
        });
        this.total = parseInt(res.data.total)
        this.items = items
      }).finally(() => {
        this.loading = false
      });
      this.$http.get('/admin/model/list-providers').then(res => {
        this.providers = res.data.map(provider => ({label: provider, value: provider}));
      }).finally(() => {
        this.loading = false;
      });
      

    },
    edit(row) {
      this.form = {...row}
      this.title = this.$t('common.edit')
      this.action = 'edit'
      this.show = true
    },
    add() {
      // this.form =  { name: '', provider: '', multiple: 0, config: '' };
      this.action = 'new'
      this.title = this.$t('common.new')
      this.show = true;
      setTimeout(() => this.$refs.form.reset(), 10);
    },
    detail(row) {
      this.form = {...row}
      this.action = 'detail'
      this.title = this.$t('common.detail')
      this.show = true
    },
    save() {
      if (this.action == 'detail') {
        this.show = false;
        return false;
      }
      this.$refs.form.validate(v => {
        if (v) {
          this.saving = true
          let { id, name, multiple, config, price_in, price_out, provider } = this.form;
          multiple = multiple? 1:0;
          this.$http.post('/admin/model/save', { id,name, multiple, config, price_in, price_out, provider }).then(res => {
            this.show = false
            this.$Message.success("Save successfuly.")
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