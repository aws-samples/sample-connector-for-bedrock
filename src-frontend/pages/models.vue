<template>
  <div class="container">
    <Space>
      <Button @click="add">{{ $t("keys.btn_new") }}</Button>
      <InputGroup>
        <Input
          v-model="searchText"
          :placeholder="$t('model.search_q')"
          style="width: 300px"
          @keyup.enter="get_data"
          clearable
        />
        <Button @click="get_data">{{ $t("keys.btn_query") }}</Button>
      </InputGroup>
    </Space>
    <Table :data="items" :columns="columns" :loading="loading">
      <template v-slot:price_in="c, row">
        <div style="text-align: right">
          {{ row.price_in }}/{{ $t("common.price_unit") }}
        </div>
      </template>
      <template v-slot:price_out="c, row">
        <div style="text-align: right">
          {{ row.price_out }}/{{ $t("common.price_unit") }}
        </div>
      </template>
      <template v-slot:multiple="c, row">
        {{ row.multiple ? "Y" : "N" }}
      </template>
      <template v-slot:action="c, row">
        <Space>
          <Button size="small" @click="edit(row)">
            {{ $t("keys.btn_edit") }}
          </Button>
          <Popconfirm
            :title="$t('model.tip_delete')"
            @ok="del(row)"
            :width="260"
          >
            <Button size="small">{{ $t("common.btn_delete") }}</Button>
          </Popconfirm>
          <Button size="small" @click="detail(row)">
            {{ $t("keys.btn_detail") }}
          </Button>
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
          <FormItem :label="$t('model.name')" prop="name">
            <Input :readonly="action == 'detail'" />
          </FormItem>
          <FormItem :label="$t('model.provider')" prop="provider">
            <Select
              :width="200"
              :options="providers"
              :disabled="action == 'detail'"
            >
            </Select>
          </FormItem>
          <FormItem :label="$t('model.multiple')" prop="multiple">
            <k-switch />
          </FormItem>
          <FormItem :label="$t('model.price_in')" prop="price_in">
            <Input
              :width="200"
              placeholder="Price in"
              :suffix="'/' + $t('common.price_unit')"
              :readonly="action == 'detail'"
            >
            </Input>
          </FormItem>
          <FormItem :label="$t('model.price_out')" prop="price_out">
            <Input
              :width="200"
              placeholder="Price out"
              :suffix="'/' + $t('common.price_unit')"
              :readonly="action == 'detail'"
            >
            </Input>
          </FormItem>
          <FormItem :label="$t('model.config')" prop="config">
            <TextArea :rows="8" :readonly="action == 'detail'" />
          </FormItem>
        </Form>
      </div>
    </Drawer>
  </div>
</template>
<script setup>
import { ref, reactive, onMounted, getCurrentInstance, inject } from "vue";
const $t = inject("$t");

import { message } from "kui-vue";
const { proxy } = getCurrentInstance();

const providers = ref([]);
const items = ref([]);
const title = ref("");
const action = ref("add");
const searchText = ref("");
const show = ref(false);
const page = ref(1);
const size = ref(15);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const refForm = ref();

const form = reactive({
  name: "",
  provider: "",
  multiple: 0,
  config: "",
  price_in: 0,
  price_out: 0,
  id: 0,
});

const rules = {
  name: [{ required: true }],
  provider: [{ required: true }],
};

const columns = [
  { key: "name", title: t("model.name") },
  { key: "provider", title: t("model.provider") },
  { key: "multiple", title: t("model.multiple") },
  { key: "price_in", title: t("model.price_in") },
  { key: "price_out", title: t("model.price_out") },
  { key: "action", title: t("keys.col_action") },
];

const change = (pageVal) => {
  page.value = pageVal;
  get_data();
};

const get_data = () => {
  loading.value = true;
  let {
    page: currentPage,
    size: currentSize,
    searchText: currentSearchText,
  } = { page: page.value, size: size.value, searchText: searchText.value };
  proxy.$http
    .get("/admin/model/list", {
      limit: currentSize,
      offset: (currentPage - 1) * currentSize,
      q: currentSearchText,
    })
    .then((res) => {
      let itemsData = res.data.items;
      itemsData.map((item) => {
        item.price_in = (item.price_in * 1e6).toFixed(2);
        item.price_out = (item.price_out * 1e6).toFixed(2);
        item.config = JSON.stringify(item.config, null, 2);
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
  proxy.$http
    .get("/admin/model/list-providers")
    .then((res) => {
      providers.value = res.data.map((provider) => ({
        label: provider,
        value: provider,
      }));
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
  // Object.assign(form, { name: '', provider: '', multiple: 0, config: '' });
  action.value = "new";
  title.value = t("common.new");
  show.value = true;
  form.id = 0;
  setTimeout(() => {
    refForm.value.reset();
  }, 10);
};

const detail = (row) => {
  Object.assign(form, { ...row });
  action.value = "detail";
  title.value = t("common.detail");
  show.value = true;
};

const del = (row) => {
  loading.value = true;
  proxy.$http
    .post("/admin/model/delete", { id: row.id })
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
      let { id, name, multiple, config, price_in, price_out, provider } = form;
      multiple = multiple ? 1 : 0;
      proxy.$http
        .post("/admin/model/save", {
          id,
          name,
          multiple,
          config,
          price_in,
          price_out,
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

onMounted(() => {
  get_data();
});
</script>
