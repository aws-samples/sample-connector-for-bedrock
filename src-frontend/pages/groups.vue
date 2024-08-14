<template>
  <div class="container">
    <Space>
      <Button @click="get_data">{{ $t('keys.btn_query') }}</Button>
      <Button @click="add">{{ $t('keys.btn_new') }}</Button>
    </Space>
    <Table :data="items" :columns="columns" :loading="loading" >
      <template v-slot:action="c, row">
        <Space>
          <Button size="small" @click="edit(row)">{{ $t('common.edit') }}</Button> 
          <Popconfirm :title="$t('group.tip_delete')" @ok="del(row)" :width="260">
            <Button size="small">{{ $t('common.btn_delete') }}</Button>
          </Popconfirm>
          <Button size="small" @click="listModels(row)">{{ $t('group.btn_models') }}</Button>
        </Space>
      </template>
    </Table>
    <Page :current="page" :total="total" @change="change" :page-size="size" />
    <Drawer :title="title" v-model="show" @ok="save" :loading="saving" :mask-closable="true">
      <Form :model="form" :rules="rules" layout="vertical" ref="form" theme="light">
        <FormItem :label="this.$t('group.name')" prop="name">
          <Input />
        </FormItem>
        <FormItem :label="this.$t('group.key')" prop="key">
          <Input />
        </FormItem>
      </Form>
    </Drawer>
    
    <Drawer :title="title" v-model="modelsShown" @ok="modelsShown=false" :loading="saving" :mask-closable="true">
      <CheckboxGroup :options="models" v-model="checked_models" @change="setModel"/>
    </Drawer>
  </div>
</template>
<script>
export default {
  name: 'Groups',
  data() {
    return {
      items: [],
      title: '',
      columns: [
        { key: 'name', title: this.$t('group.name') },
        { key: 'key', title: this.$t('group.key') },
        { key: 'action', title: this.$t('common.action')},
      ],
      form: { name: '', key: '', id: '' },
      rules: {
        name: [{ required: true, message: 'Please input name...' }],
      },
      action: "add",
      show: false,
      modelsShown: false,
      models:[],
      checked_models:[],
      page: 1,
      size: 15,
      total: 0,
      loading: false,
      saving: false,
      current_group_id: 0
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
      let { page, size } = this;
      this.$http.get('/admin/group/list', { limit: size, offset: (page - 1) * size }).then(res => {
        let items = res.data.items;
        this.items = items;
      }).finally(() => {
        this.loading = false;
      });
      this.$http.get('/admin/model/list', { limit: 1000, offset:0}).then(res => {
        let items = res.data.items;
        this.models = items.map(it=>({
          label: it.name,
          value: it.id
        }));
      }).finally(() => {
        this.loading = false;
      });
    },
    edit(row) {
      this.form = {...row}
      this.title = this.$t('keys.btn_edit')
      this.action = 'edit'
      this.show = true
    },
    del(row) {
      this.loading = true;
      this.$http.post("/admin/group/delete", { id: row.id }).then(() => {
        this.$Message.success("Delete successfuly.");
        this.get_data();
      }).finally(() => {
        this.loading = false;
      });
    },
    listModels(row) {
      this.current_group_id = row.id;
      this.title = this.$t('group.title_set_models');
      this.$http.get('/admin/group/list-model', {group_id:this.current_group_id,  limit: 1000, offset:0}).then(res => {
        let items = res.data.items;
        this.checked_models = items.map(it=>it.model_id);
        this.modelsShown = true;
      }).finally(() => {
        this.loading = false;
      });
    },
    setModel(e) {
      const model_id = e.value;
      this.$http.post("/admin/group/bind-or-unbind-model", {group_id:this.current_group_id, model_id}).then(res => {
        this.$Message.success("Save successfuly.")
      }).finally(() => {
        this.loading = false;
      });
    },
    add() {
      this.action = 'new'
      this.title = this.$t('keys.btn_new')
      this.show = true
      this.$nextTick(() => {
        this.$refs.form.reset()
      });
    },
    save() {
      this.$refs.form.validate(v => {
        if (v) {
          this.saving = true;
          this.$http.post("/admin/group/save", this.form).then(res => {
            this.show = false
            this.$Message.success("Save successfuly.")
            this.get_data()
          }).finally(() => {
            this.saving = false
          })
        }
      });
    }
  }
}
</script>