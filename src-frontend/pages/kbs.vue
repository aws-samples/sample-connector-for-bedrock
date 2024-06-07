<template>
  <div class="my-knowledge-bases">
    <Space>
      <Button @click="get_data">{{ $t('keys.btn_query') }}</Button>
      <Button @click="add">{{ $t('keys.btn_new') }}</Button>
    </Space>
    <Table :data="items" :columns="columns" :loading="loading">
      <template v-slot:api_key="c, row">
        <Space>
          {{ format_key(row) }}
        </Space>
      </template>
      <template v-slot:action="c, row">
        <Space>
          <Button size="small" @click="edit(row)">{{ $t('keys.btn_edit') }}</Button>
        </Space>
      </template>
    </Table>
    <Page :current="page" :total="total" @change="change" :page-size="size" />
    <Modal :title="title" v-model="show" @ok="save" :loading="saving" class="my-knowledge-bases-model">
      <div>
      <Form :model="form" :rules="rules" layout="horizontal" ref="form" theme="light" :labelCol="{span:8}" :wrapperCol="{span:13}"
>
        <FormItem :label="this.$t('knowledgebases.name')" prop="name">
          <Input placeholder="Name" :readonly="action == 'edit'" />
        </FormItem>
        <FormItem :label="this.$t('knowledgebases.knowledge_base_id')" prop="knowledgeBaseId">
          <Input placeholder="" />
        </FormItem>
        <FormItem :label="this.$t('knowledgebases.summary_model')" prop="summaryModel">
          <Select :width="200" placeholder="SummaryModel">
            <Option label="Claude3 Haiku" value="claude-3-haiku" />
            <Option label="Claude3 Sonnet" value="claude-3-sonnet" />
            <Option label="Claude3 Opus" value="claude-3-opus" />
          </Select>
        </FormItem>
        <FormItem :label="this.$t('knowledgebases.region')" prop="region">
          <Input placeholder="Region" />
        </FormItem>
      </Form>
      </div>
    </Modal>
  </div>
</template>
<script>

export default {
  name: 'KnowledgeBases',
  data() {
    return {
      items: [],
      title: '',
      columns: [
        { key: 'name', title: this.$t('knowledgebases.name') },
        { key: 'knowledgeBaseId', title: this.$t('knowledgebases.knowledge_base_id') },
        { key: 'summaryModel', title: this.$t('knowledgebases.summary_model') },
        { key: 'region', title: this.$t('knowledgebases.region') },
        { key: 'created_at', title: this.$t('common.created_at') },
        { key: 'updated_at', title: this.$t('common.updated_at') },
        { key: 'action', title: this.$t('keys.col_action') },
      ],
      form: { name: '', knowledgeBaseId: '', summaryModel: 'Model', region: '' },
      rules: {
        name: [{ required: true }],
        knowledgeBaseId: [{ required: true }],
        summaryModel: [{ required: true }],
        region: [{ required: true }]
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
      this.$http.get('/admin/model/list', {provider:"bedrock-knowledge-base",  limit: size, offset: (page - 1) * size }).then(res => {
        let items = res.data.items
        items.map(item => {
          item.region = item.config.region
          item.provider = item.config.provider
          item.summaryModel = item.config.summaryModel
          item.knowledgeBaseId = item.config.knowledgeBaseId
          item.object = item.config.object
          item.created_at = new Date(item.created_at).toLocaleString()
          item.updated_at = new Date(item.updated_at).toLocaleString()
          return item
        });
        this.total = parseInt(res.data.total)
        this.items = items
      }).finally(() => {
        this.loading = false
      })
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
      this.show = true
    },
    save() {
      this.$refs.form.validate(v => {
        if (v) {
          this.saving = true

          let { id, name, knowledgeBaseId, summaryModel, region } = this.form
          this.$http.post('/admin/model/save-kb-model', { id, name, knowledgeBaseId, summaryModel, region }).then(res => {
            this.show = false
            this.$Message.success("Save successfuly.")
            this.get_data()
          }).finally(() => {
            this.saving = false
          })
          return
        }
      })
    }
  }
}
</script>
<style lang="less">
.my-knowledge-bases {
  padding: 20px;

  th {
    word-break: keep-all !important;
  }
}
.my-knowledge-bases-model {
  .k-form-item-label {
    width: 120px;
  }
}
</style>