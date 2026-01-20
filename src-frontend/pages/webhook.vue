<template>
  <div class="container">
    <Space>
      <Button @click="get_data">{{ $t("keys.btn_query") }}</Button>
      <Button @click="add">{{ $t("keys.btn_new") }}</Button>
    </Space>
    <Table :data="items" :columns="columns" :loading="loading">
      <template v-slot:action="c, row">
        <Space>
          <Button size="small" type="warning" @click="edit(row)">{{
            $t("keys.btn_edit")
          }}</Button>
          <Popconfirm
            :title="$t('webhook.tip_delete')"
            @ok="del(row)"
            :width="260"
          >
            <Button size="small" type="danger">{{
              $t("common.btn_delete")
            }}</Button>
          </Popconfirm>
          <Button size="small" type="primary" @click="detail(row)">{{
            $t("keys.btn_detail")
          }}</Button>
        </Space>
      </template>
    </Table>
    <Page :current="page" :total="total" @change="change" :page-size="size" />
    <Drawer
      :title="title"
      v-model="show"
      @ok="save"
      :loading="saving"
      :mask-closable="true"
    >
      <div>
        <Form
          :model="form"
          :rules="rules"
          layout="horizontal"
          ref="refForm"
          :labelCol="{ span: 5 }"
          :wrapperCol="{ span: 18 }"
        >
          <FormItem :label="$t('webhook.name')" prop="name">
            <Input :readonly="action == 'detail'" />
          </FormItem>
          <FormItem :label="$t('webhook.provider')" prop="provider">
            <Select
              :width="200"
              :options="providers"
              :disabled="action == 'detail'"
            >
            </Select>
          </FormItem>
          <FormItem :label="$t('webhook.config')" prop="config">
            <TextArea :rows="8" :readonly="action == 'detail'" />
          </FormItem>
        </Form>
      </div>
    </Drawer>
  </div>
</template>
<script setup>
import { ref, reactive, onMounted, getCurrentInstance, inject } from "vue";
const { proxy } = getCurrentInstance();
import { message } from "kui-vue";
const $t = inject("$t");

const providers = ref([]);
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

const columns = [
  { key: "name", title: $t("webhook.name") },
  { key: "provider", title: $t("webhook.provider") },
  // {key: 'config', title: $t('webhook.config')},
  { key: "action", title: $t("keys.col_action") },
];

const form = reactive({ name: "", provider: "", config: "", id: 0 });

const rules = {
  name: [{ required: true }],
  provider: [{ required: true }],
};

onMounted(() => {
  get_data();
});

const change = (pageVal) => {
  page.value = pageVal;
  get_data();
};

const get_data = () => {
  loading.value = true;
  let { page: pageNum, size: sizeVal } = { page: page.value, size: size.value };
  proxy.$http
    .get("/admin/bot-connector/list", {
      limit: sizeVal,
      offset: (pageNum - 1) * sizeVal,
    })
    .then((res) => {
      let itemsData = res.data.items;
      itemsData.map((item) => {
        item.config = JSON.stringify(item.config, null, 2);
        item.created_at = new Date(item.created_at).toLocaleString();
        item.updated_at = new Date(item.updated_at).toLocaleString();
        return item;
      });
      proxy.$http
        .get("/admin/bot-connector/list-providers")
        .then((res) => {
          providers.value = res.data.map((provider) => ({
            label: provider,
            value: provider,
          }));
        })
        .finally(() => {
          loading.value = false;
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
  title.value = $t("common.edit");
  action.value = "edit";
  show.value = true;
};

const add = () => {
  action.value = "new";
  title.value = $t("common.new");
  show.value = true;
  form.id = 0;
  setTimeout(() => refForm.value.reset(), 10);
};

const detail = (row) => {
  Object.assign(form, { ...row });
  action.value = "detail";
  title.value = $t("common.detail");
  show.value = true;
};

const del = (row) => {
  loading.value = true;
  console.log(row.id);
  proxy.$http
    .post("/admin/bot-connector/delete", { id: row.id })
    .then(() => {
      message.success("Delete successfully.");
      get_data();
    })
    .finally(() => {
      loading.value = false;
    });
};

const save = () => {
  if (action.value == "detail") {
    show.value = false;
    return false;
  }
  refForm.value.validate((v) => {
    if (v) {
      saving.value = true;
      let { id, name, config, provider } = form;
      proxy.$http
        .post("/admin/bot-connector/save", {
          id,
          name,
          config,
          provider,
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
</script>
