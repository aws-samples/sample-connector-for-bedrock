<template>
  <div class="my-keys">
    <Space>
      <Button @click="get_data">{{ $t('keys.btn_query') }}</Button>
      <Button @click="add">{{ $t('keys.btn_new') }}</Button>

          <Button :icon="CloudUpload" @click="importUser">{{ $t('keys.btn_import') }}</Button>

    </Space>
    <Table :data="items" :columns="columns" :loading="loading" :width="1900">
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

          <Popconfirm 
            :title="$t('keys.tip_reset')"
            @ok="rest(row)"
          >
            <Button size="small">{{ $t('keys.btn_reset') }}</Button>
          </Popconfirm>
          <Button size="small" @click="listModels(row)">{{ $t('keys.btn_models') }}</Button>
        </Space>
      </template>
    </Table>
    <Page :current="page" :total="total" @change="change" :page-size="size" />
    <Drawer :title="title" v-model="show" @ok="save" :loading="saving" :mask-closable="true">
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
        <FormItem :label="this.$t('keys.col_group')" prop="group_id" v-if="action != 'recharge'">
          <Select :width="200" :options="groups" v-model="form.group_id">
          </Select>
        </FormItem>
        <FormItem :label="this.$t('keys.btn_recharge')" prop="balance" v-if="action == 'recharge'">
          <Input placeholder="Balance" />
        </FormItem>
        <FormItem :label="this.$t('keys.col_month_quota')" prop="month_quota" v-if="action != 'recharge'">
          <Input />
        </FormItem>
      </Form>
    </Drawer>
    
    <Drawer :title="this.$t('keys.title_import_user')" v-model="showImport" @ok="submitExcel" :loading="saving" :mask-closable="true">
      <Form :model="importForm" layout="vertical" ref="importForm" theme="light">
        <FormItem :label="this.$t('keys.upload_file')" prop="file">
            <Upload 
            action=""
              name="file"
              :autoTrigger="false"
              :limit="1"
              :showUploadList="true"
              >Choose</Upload>
        </FormItem>
        <FormItem :label="this.$t('keys.col_group')" prop="group_id">
          <Select :width="200" :options="groups">
          </Select>
        </FormItem>
        <FormItem :label="this.$t('keys.col_month_quota')" prop="month_quota">
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
import { Copy, CloudUpload} from 'kui-icons'
export default {
  name: 'AdminKeys',
  data() {
    let url = localStorage.getItem('host');
    const key = localStorage.getItem('key')
    if (url.endsWith('/')) {
      url = host.substring(0, host.length - 1);
    }
    url = url + '/admin/api-key/import';
    return {
      Copy,
      CloudUpload,
      items: [],
      title: '',
      columns: [
        { key: 'name', title: this.$t('keys.col_name') ,fixed: "left"  },
        { key: 'api_key', title: this.$t('keys.col_key'),fixed: "left" },
        { key: 'email', title: this.$t('keys.col_email') },
        { key: 'role', title: this.$t('keys.col_role') },
        { key: 'group_name', title: this.$t('keys.col_group') },
        { key: 'total_fee', title: this.$t('keys.col_total_fee') },
        { key: 'balance', title: this.$t('keys.col_balance') },
        { key: 'month_fee', title: this.$t('keys.col_month_fee') },
        { key: 'month_quota', title: this.$t('keys.col_month_quota') },
        // { key: 'created_at', title: 'Date' },
        { key: 'action', title: this.$t('keys.col_action') ,fixed: "right", width: 300 },
      ],
      form: { name: '', email: '', role: 'user', month_quota: 0, balance: 0 , group_id: 0},
      rules: {
        name: [{ required: true, message: 'Please input name...' }],
      },
      importForm: {
        month_quota: 1, group_id: 1
      },
      groups:[],
      action: "add",
      show: false,
      showImport:false,
      page: 1,
      size: 15,
      total: 0,
      loading: false,
      saving: false,
      modelsShown: false,
      models:[],
      checked_models:[],
      current_key_id: 0,
      uploadEndpoint: url,
      uploadHeaders: { authorization: "Bearer " + key}
    }
  },
  mounted() {
    this.get_data()
  },
  methods: {
    importUser() {
      this.showImport = true;
    },
    submitExcel(){
      console.log("upload URL: " + this.uploadEndpoint);
      console.log(this.$refs.importForm);
      setTimeout(() => {
      }, 0);
      
      //TODO: 这里加入回调
    },
    uploadChange(info){
      console.log(info);
    },
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
    change(page) {
      this.page = page
      this.get_data()
    },
    listModels(row) {
      this.current_key_id = row.id;
      this.title = this.$t('group.title_set_models');
      this.$http.get('/admin/api-key/list-model', {key_id:this.current_key_id,  limit: 1000, offset:0}).then(res => {
        let items = res.data.items;
        this.checked_models = items.map(it=>it.model_id);
        this.modelsShown = true;
      }).finally(() => {
        this.loading = false;
      });
    },
    setModel(e) {
      const model_id = e.value;
      this.$http.post("/admin/api-key/bind-or-unbind-model", {key_id:this.current_key_id, model_id}).then(res => {
        this.$Message.success("Save successfuly.")
      }).finally(() => {
        this.loading = false;
      });
    },
    get_data() {
      this.loading = true;
      let { page, size } = this;
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
      this.$http.get('/admin/group/list', { limit: 1000, offset:0}).then(res => {
        let items = res.data.items;
        this.groups = items.map(it=>({
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
    recharge(row) {
      this.form = {...row}
      this.form.balance = 0
      this.title = this.$t('keys.btn_recharge')
      this.action = 'recharge'
      this.show = true
    },
    rest(row) {
      this.loading = true;
      this.$http.post("/admin/api-key/reset-key", {id:row.id}).then(() => {
        this.$Message.success("Reset successfuly.");
        this.get_data();
      }).finally(() => {
        this.loading = false;
      });
    },
    add() {
      this.action = 'new'
      this.title = this.$t('keys.btn_new')
      this.show = true
      this.form.id = 0;
      this.form.role = 'user'
      this.$nextTick(() => {
        this.$refs.form.reset()
      });
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
              this.get_data()
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