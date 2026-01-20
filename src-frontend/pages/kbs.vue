<template>
  <div class="my-knowledge-bases">
    <Space>
      <Button @click="get_data">{{ $t("keys.btn_query") }}</Button>
      <Button @click="add">{{ $t("keys.btn_new") }}</Button>
    </Space>
    <Table :data="items" :columns="columns" :loading="loading">
      <template v-slot:action="c, row">
        <Space>
          <Button size="small" @click="edit(row)">{{
            $t("keys.btn_edit")
          }}</Button>
        </Space>
      </template>
    </Table>
    <Page :current="page" :total="total" @change="change" :page-size="size" />
    <Modal
      :title="title"
      v-model="show"
      @ok="save"
      :loading="saving"
      class="my-knowledge-bases-model"
    >
      <Form
        :model="form"
        :rules="rules"
        layout="horizontal"
        ref="refForm"
        :labelCol="{ span: 8 }"
        :wrapperCol="{ span: 13 }"
      >
        <FormItem :label="$t('knowledgebases.name')" prop="name">
          <Input placeholder="Name" :readonly="action == 'edit'" />
        </FormItem>
        <FormItem
          :label="$t('knowledgebases.knowledge_base_id')"
          prop="knowledgeBaseId"
        >
          <Input placeholder="" />
        </FormItem>
        <FormItem
          :label="$t('knowledgebases.summary_model')"
          prop="summaryModel"
        >
          <Select :width="200" placeholder="SummaryModel">
            <Option label="Claude3 Haiku" value="claude-3-haiku" />
            <Option label="Claude3 Sonnet" value="claude-3-sonnet" />
            <Option label="Claude3 Opus" value="claude-3-opus" />
          </Select>
        </FormItem>
        <FormItem :label="$t('knowledgebases.region')" prop="region">
          <Input placeholder="Region" />
        </FormItem>
      </Form>
    </Modal>
  </div>
</template>
<script setup>
import { ref, reactive, onMounted, getCurrentInstance, inject } from "vue";
import { message } from "kui-vue";
const $t = inject("$t");
const { proxy } = getCurrentInstance();
const items = ref([]);
const title = ref("");
const action = ref("add");
const show = ref(false);
const page = ref(1);
const size = ref(15);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const refForm = ref(null);
const form = reactive({
  name: "",
  knowledgeBaseId: "",
  summaryModel: "Model",
  region: "",
});

const rules = {
  name: [{ required: true }],
  knowledgeBaseId: [{ required: true }],
  summaryModel: [{ required: true }],
  region: [{ required: true }],
};

const columns = [
  { key: "name", title: t("knowledgebases.name") },
  { key: "knowledgeBaseId", title: t("knowledgebases.knowledge_base_id") },
  { key: "summaryModel", title: t("knowledgebases.summary_model") },
  { key: "region", title: t("knowledgebases.region") },
  { key: "created_at", title: t("common.created_at") },
  { key: "updated_at", title: t("common.updated_at") },
  { key: "action", title: t("keys.col_action") },
];

const change = (pageVal) => {
  page.value = pageVal;
  get_data();
};

const get_data = () => {
  loading.value = true;
  const { page: currentPage, size: currentSize } = {
    page: page.value,
    size: size.value,
  };
  proxy.$http
    .get("/admin/model/list", {
      provider: "bedrock-knowledge-base",
      limit: currentSize,
      offset: (currentPage - 1) * currentSize,
    })
    .then((res) => {
      let itemsData = res.data.items;
      itemsData.map((item) => {
        item.region = item.config.region || "";
        item.provider = item.config.provider || "";
        item.summaryModel = item.config.summaryModel || "";
        item.knowledgeBaseId = item.config.knowledgeBaseId || "";
        item.object = item.config.object;
        item.created_at = new Date(item.created_at).toLocaleString();
        item.updated_at = new Date(item.updated_at).toLocaleString();
        return item;
      });
      total.value = parseInt(res.data.total);
      items.value = itemsData;
    })
    .finally(() => {
      loading.value = false;
    });
};

const edit = (row) => {
  Object.assign(form, { ...row });
  title.value = t("common.edit");
  action.value = "edit";
  show.value = true;
};

const add = () => {
  form.id = "";
  action.value = "new";
  title.value = t("common.new");
  show.value = true;
};

const save = () => {
  refForm.value.validate((v) => {
    if (v) {
      saving.value = true;

      let { id, name, knowledgeBaseId, summaryModel, region } = { ...form };
      proxy.$http
        .post("/admin/model/save-kb-model", {
          id,
          name,
          knowledgeBaseId,
          summaryModel,
          region,
        })
        .then(() => {
          show.value = false;
          message.success("Save successfully.");
          get_data();
        })
        .finally(() => {
          saving.value = false;
        });
    }
  });
};

onMounted(() => {
  get_data();
});
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
