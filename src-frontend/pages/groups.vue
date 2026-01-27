<template>
  <div class="groups">
    <Space>
      <Button @click="get_data">{{ $t("keys.btn_query") }}</Button>
      <Button @click="add">{{ $t("keys.btn_new") }}</Button>
    </Space>
    <Table :data="items" :columns="columns" :loading="loading">
      <template #action="{ record }">
        <Space>
          <Button size="small" @click="edit(record)">
            {{ $t("common.edit") }}
          </Button>
          <Popconfirm
            :title="$t('group.tip_delete')"
            @ok="del(record)"
            :width="260"
          >
            <Button size="small">{{ $t("common.btn_delete") }}</Button>
          </Popconfirm>
          <Button
            size="small"
            @click="listModels(record)"
            :loading="record.loading"
          >
            {{ $t("group.btn_models") }}
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
      <Form :model="form" :rules="rules" layout="vertical" ref="refForm">
        <FormItem :label="$t('group.name')" prop="name">
          <Input />
        </FormItem>
        <FormItem :label="$t('group.key')" prop="key">
          <Input />
        </FormItem>
      </Form>
    </Drawer>

    <Drawer
      :title="title"
      v-model="modelsShown"
      @ok="modelsShown = false"
      :loading="saving"
      :width="650"
      :mask-closable="true"
    >
      <ModelList
        :checked_models="checked_models"
        :models="models"
        :group_id="current_group_id"
        type="group"
      />
    </Drawer>
  </div>
</template>
<script setup>
import {
  ref,
  reactive,
  onMounted,
  getCurrentInstance,
  nextTick,
  inject,
} from "vue";
import { message } from "kui-vue";
const { proxy } = getCurrentInstance();
import ModelList from "../components/modelList/index.vue";
const $t = inject("$t");

const refForm = ref();
const items = ref([]);
const title = ref("");
const action = ref("add");
const show = ref(false);
const modelsShown = ref(false);
const models = ref([]);
const checked_models = ref([]);
const page = ref(1);
const size = ref(15);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const current_group_id = ref(0);

const form = reactive({ name: "", key: "", id: "" });

const rules = {
  name: [{ required: true, message: "Please input name..." }],
};

const columns = [
  { key: "name", title: $t("group.name") },
  { key: "key", title: $t("group.key") },
  { key: "action", title: $t("common.action") },
];

const get_data = () => {
  loading.value = true;
  const { page: currentPage, size: currentSize } = {
    page: page.value,
    size: size.value,
  };

  proxy.$http
    .get("/admin/group/list", {
      limit: currentSize,
      offset: (currentPage - 1) * currentSize,
    })
    .then((res) => {
      const itemsData = res.data.items;
      items.value = itemsData;
    })
    .finally(() => {
      loading.value = false;
    });

  proxy.$http
    .get("/admin/model/list", { limit: 1000, offset: 0 })
    .then((res) => {
      const itemsData = res.data.items;
      models.value = itemsData.map((it) => ({
        label: it.name,
        value: it.id,
      }));
    })
    .finally(() => {
      loading.value = false;
    });
};
const change = (pageVal) => {
  page.value = pageVal;
  get_data();
};
const edit = (row) => {
  Object.assign(form, { ...row });
  title.value = $t("keys.btn_edit");
  action.value = "edit";
  show.value = true;
};

const del = (row) => {
  loading.value = true;
  proxy.$http
    .post("/admin/group/delete", { id: row.id })
    .then(() => {
      message.success("Delete successfully.");
      get_data();
    })
    .finally(() => {
      loading.value = false;
    });
};

const listModels = (row) => {
  current_group_id.value = row.id;
  title.value = $t("group.title_set_models");
  // row.loading = true;
  proxy.$set(row, "loading", true);
  proxy.$http
    .get("/admin/group/list-model", {
      group_id: current_group_id.value,
      limit: 1000,
      offset: 0,
    })
    .then((res) => {
      const itemsData = res.data.items;
      checked_models.value = itemsData.map((it) => it.model_id);
      modelsShown.value = true;
    })
    .finally(() => {
      row.loading = false;
      loading.value = false;
    });
};

const add = () => {
  action.value = "new";
  title.value = $t("keys.btn_new");
  show.value = true;
  nextTick(() => {
    refForm.value.reset();
  });
};

const save = () => {
  refForm.value.validate((v) => {
    if (v) {
      saving.value = true;
      proxy.$http
        .post("/admin/group/save", form)
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
