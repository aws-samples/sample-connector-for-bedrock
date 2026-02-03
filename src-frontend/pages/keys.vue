<template>
  <div class="my-keys">
    <div>
      <Space>
        <Button @click="add">{{ $t("keys.btn_new") }}</Button>
        <Button :icon="CloudUpload" @click="importUser">
          {{ $t("keys.btn_import") }}
        </Button>
        <InputGroup>
          <Input
            v-model="searchText"
            :placeholder="$t('keys.search_q')"
            style="width: 300px"
            @keyup.enter="search"
          />
          <Button @click="search">{{ $t("keys.btn_query") }}</Button>
        </InputGroup>
      </Space>
    </div>
    <Table
      :data="items"
      :columns="columns"
      :loading="loading"
      @change="handleTableChange"
      :scroll="{ y: `calc(100vh - 230px)` }"
    >
      <template #api_key="{ record }">
        <Space>
          {{ format_key(record) }}
          <Tooltip :title="$t('keys.tip_copy_key')">
            <Button :icon="Copy" size="small" @click="copyCode(record)" />
          </Tooltip>
        </Space>
      </template>

      <template #updated_at="{ record }">
        <Space>
          {{ format_date(record) }}
        </Space>
      </template>

      <template #action="{ record }">
        <Dropdown>
          <Button type="primary" :icon="Settings" />
          <template #overlay>
            <Menu @select="({ key }) => menuAction(key, record)">
              <MenuItem key="recharge">
                {{ $t("keys.btn_recharge") }}
              </MenuItem>
              <MenuItem key="edit">{{ $t("keys.btn_edit") }}</MenuItem>
              <MenuItem key="rest">
                {{ $t("keys.btn_reset") }}
              </MenuItem>
              <MenuItem key="delete"> {{ $t("common.btn_delete") }} </MenuItem>
              <MenuItem key="models">
                {{ $t("keys.btn_models") }}
              </MenuItem>
            </Menu>
          </template>
        </Dropdown>
      </template>
    </Table>
    <Page :current="page" :total="total" @change="change" :page-size="size" />
    <Drawer :title="title" v-model="show" @ok="save" :loading="saving" :mask-closable="true">
      <Form :model="form" :rules="rules" layout="vertical" ref="refForm">
        <FormItem :label="$t('keys.col_name')" prop="name">
          <Input placeholder="Name" :readonly="action == 'recharge'" />
        </FormItem>
        <FormItem :label="$t('keys.col_email')" prop="email" :readonly="action == 'recharge'">
          <Input placeholder="Email" />
        </FormItem>
        <FormItem :label="$t('keys.col_role')" prop="role" v-if="action != 'recharge'">
          <Select :width="200" placeholder="Role">
            <Option value="user" :label="$t('keys.op_normal')" />
            <Option value="admin" :label="$t('keys.op_admin')" />
          </Select>
        </FormItem>
        <FormItem :label="$t('keys.col_group')" prop="group_id" v-if="action != 'recharge'">
          <Select :width="200" :options="groups" v-model="form.group_id"> </Select>
        </FormItem>
        <FormItem :label="$t('keys.btn_recharge')" prop="balance" v-if="action == 'recharge'">
          <Input placeholder="Balance" />
        </FormItem>
        <FormItem
          :label="$t('keys.col_month_quota')"
          prop="month_quota"
          v-if="action != 'recharge'"
        >
          <Input />
        </FormItem>
      </Form>
    </Drawer>

    <Modal
      :title="$t('keys.title_import_user')"
      v-model="showImport"
      @ok="submitExcel"
      :loading="saving"
      :mask-closable="true"
    >
      <Form :model="importForm" ref="refImportForm" :rules="uploadRules" :labelCol="{ span: 5 }">
        <FormItem :label="$t('keys.upload_file')" prop="file">
          <Input style="width: 275px" readonly="true" v-model="importFileName">
            <template #suffix>
              <Space>
                <Button @click="$refs.file.click()" :icon="FolderOpen"></Button>
                <Button
                  type="link"
                  href="https://aws-samples.github.io/sample-connector-for-bedrock/user-manual/management/#import-users"
                  target="_blank"
                >
                  Help
                </Button>
                <input type="file" ref="file" style="display: none" @change="fileChange" />
              </Space>
            </template>
          </Input>
        </FormItem>
        <FormItem :label="$t('keys.col_group')" prop="group_id">
          <Select style="width: 200px" :options="groups"> </Select>
        </FormItem>
        <FormItem :label="$t('keys.col_month_quota')" prop="month_quota">
          <Input style="width: 200px" />
        </FormItem>
      </Form>
    </Modal>
    <Drawer
      :title="title"
      v-model="modelsShown"
      @ok="modelsShown = false"
      :loading="saving"
      :width="650"
      :mask-closable="true"
    >
      <ModelList
        :models="models"
        :checked_models="checked_models"
        :key_id="current_key_id"
        type="api-key"
      />
    </Drawer>
  </div>
</template>
<script setup>
import { ref, reactive, nextTick, onMounted, getCurrentInstance, inject, defineOptions } from "vue";
import { useClipboard } from "@vueuse/core";
import { Copy, CloudUpload, FolderOpen, Settings } from "kui-icons";
import ModelList from "../components/modelList/index.vue";
import { message, modal } from "kui-vue";
const $t = inject("$t");
const { copy, isSupported } = useClipboard();
const { proxy } = getCurrentInstance();
let url = localStorage.getItem("host");
const key = localStorage.getItem("key");
defineOptions({
  name: "AdminKeys",
});
if (url.endsWith("/")) {
  url = url.substring(0, url.length - 1);
}
url = url + "/admin/api-key/import";

const refForm = ref();
const refImportForm = ref();
const items = ref([]);
const searchText = ref("");
const title = ref("");
const action = ref("add");
const show = ref(false);
const showImport = ref(false);
const page = ref(1);
const size = ref(15);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const modelsShown = ref(false);
const models = ref([]);
const checked_models = ref([]);
const current_key_id = ref(0);
const importFileName = ref("");
const currentSort = ref({
  key: "",
  order: "",
});

const form = reactive({
  name: "",
  email: "",
  role: "user",
  month_quota: 0,
  balance: 0,
  group_id: 0,
});

const rules = {
  name: [{ required: true, message: "Please input name..." }],
};

const uploadRules = {
  file: [{ required: true, message: "Please choose a csv file..." }],
};

const importForm = reactive({
  month_quota: 1,
  group_id: 1,
  file: "",
});

const groups = ref([]);

const columns = [
  {
    key: "name",
    title: $t("keys.col_name"),
    fixed: "left",
    sorter: true,
    sortKey: "id",
  },
  { key: "api_key", title: $t("keys.col_key"), fixed: "left" },
  { key: "email", title: $t("keys.col_email") },
  { key: "role", title: $t("keys.col_role") },
  { key: "group_name", title: $t("keys.col_group") },
  {
    key: "total_fee",
    title: $t("keys.col_total_fee"),
    sorter: true,
    sortKey: "total",
  },
  {
    key: "balance",
    title: $t("keys.col_balance"),
    sorter: true,
    sortKey: "balance",
  },
  {
    key: "month_fee",
    title: $t("keys.col_month_fee"),
    sorter: true,
    sortKey: "month",
  },
  {
    key: "month_quota",
    title: $t("keys.col_month_quota"),
    sorter: true,
    sortKey: "quota",
  },
  {
    key: "updated_at",
    title: $t("keys.col_updated_at"),
    sorter: true,
    sortKey: "update",
  },
  {
    key: "action",
    title: $t("keys.col_action"),
    width: 64,
    fixed: "right",
  },
];

const uploadEndpoint = url;
// const uploadHeaders = { authorization: "Bearer " + key };

const handleTableChange = (filters, sorter) => {
  if (sorter) {
    // 当order为null时，表示取消排序，此时清除排序状态
    if (sorter.order === null) {
      currentSort.value = {
        key: "",
        order: "",
      };
    } else {
      // 使用sortKey作为orderBy的前缀
      const column = columns.find((col) => col.key === sorter.key);
      if (column && column.sortKey) {
        currentSort.value = {
          key: column.sortKey,
          order: sorter.order === "asc" ? "0" : "1",
        };
      }
    }
    get_data();
  }
};

const search = () => {
  page.value = 1;
  get_data();
};

const importUser = () => {
  showImport.value = true;
};

const fileChange = (e) => {
  // console.log("fileChange",e.target.value)
  importFileName.value = "e.target.value"; //.split("\\").pop();
};

const submitExcel = () => {
  refImportForm.value.validate((v) => {
    if (v) {
      saving.value = true;
      let data = new FormData();
      let { month_quota, group_id } = importForm;
      data.append("month_quota", month_quota);
      data.append("group_id", group_id);
      data.append("file", document.querySelector('input[type="file"]').files[0]);

      proxy.$http
        .post(uploadEndpoint, data)
        .then((res) => {
          if (res.success) {
            message.success("Import successfully.");
            showImport.value = false;
            get_data();

            document.querySelector('input[type="file"]').value = null;
            importFileName.value = null;
          }
        })
        .finally(() => {
          saving.value = false;
        });
    }
  });
};

const copyCode = ({ api_key }) => {
  copy(api_key)
    .then(() => {
      message.success("Copied");
    })
    .catch(() => {
      message.error("Copied failed.");
    });
};

const format_date = ({ updated_at }) => {
  const date = new Date(updated_at);
  return date.toLocaleString();
};

const format_key = ({ api_key }) => {
  return api_key ? api_key.substr(0, 5) + "..." + api_key.substr(-3) : "";
};

const change = (pageVal) => {
  page.value = pageVal;
  get_data();
};

const loadGroups = () => {
  proxy.$http.get("/admin/group/list", { limit: 1000, offset: 0 }).then((res) => {
    let items = res.data.items;
    groups.value = items.map((it) => ({
      label: it.name,
      value: it.id,
    }));
  });
};

const listModels = (row) => {
  current_key_id.value = row.id;
  title.value = $t("group.title_set_models");

  proxy.$http
    .get("/admin/api-key/list-model", {
      key_id: current_key_id.value,
      limit: 1000,
      offset: 0,
    })
    .then((res) => {
      let items = res.data.items;
      checked_models.value = items.map((it) => it.model_id);

      proxy.$http.get("/admin/model/list", { limit: 1000, offset: 0 }).then((res) => {
        let items = res.data.items;
        models.value = items.map((it) => ({
          label: it.name,
          value: it.id,
        }));
        modelsShown.value = true;
      });
    })
    .finally(() => {
      loading.value = false;
    });
};

const get_data = () => {
  loading.value = true;
  let {
    page: currentPage,
    size: currentSize,
    searchText: searchValue,
    currentSort: sortValue,
  } = {
    page: page.value,
    size: size.value,
    searchText: searchText.value,
    currentSort: currentSort.value,
  };
  let params = {
    limit: currentSize,
    offset: (currentPage - 1) * currentSize,
    q: searchValue,
  };

  if (sortValue.key && sortValue.order) {
    params.orderBy = `${sortValue.key}-${sortValue.order}`;
  }

  proxy.$http
    .get("/admin/api-key/list", params)
    .then((res) => {
      let itemsData = res.data.items;
      itemsData.map((item) => {
        item.total_fee = parseFloat(item.total_fee);
        item.balance = parseFloat(item.balance);
        item.month_fee = parseFloat(item.month_fee);
        item.month_quota = parseFloat(item.month_quota);
        return item;
      });
      total.value = res.data.total * 1;
      items.value = itemsData;
    })
    .finally(() => {
      loading.value = false;
    });
};

const edit = (row) => {
  Object.assign(form, { ...row });
  title.value = $t("keys.btn_edit");
  action.value = "edit";
  show.value = true;
};

const recharge = (row) => {
  Object.assign(form, { ...row });
  form.balance = 0;
  title.value = $t("keys.btn_recharge");
  action.value = "recharge";
  show.value = true;
};

const rest = (row) => {
  loading.value = true;
  proxy.$http
    .post("/admin/api-key/reset-key", { id: row.id })
    .then(() => {
      message.success("Reset successfully.");
      get_data();
    })
    .finally(() => {
      loading.value = false;
    });
};

const del = (row) => {
  loading.value = true;
  proxy.$http
    .post("/admin/api-key/delete", { id: row.id })
    .then(() => {
      message.success("Delete successfully.");
      get_data();
    })
    .finally(() => {
      loading.value = false;
    });
};

const add = () => {
  action.value = "new";
  title.value = $t("keys.btn_new");
  show.value = true;
  form.id = 0;
  form.role = "user";
  // 这里需要根据实际UI库实现表单重置
  nextTick(() => {
    refForm.value.reset();
  });
};

const save = () => {
  saving.value = true;
  if (action.value == "recharge") {
    let { id, balance } = form;
    proxy.$http
      .post("/admin/api-key/recharge", { id, balance })
      .then((res) => {
        show.value = false;
        message.success("Save successfully.");
        get_data();
      })
      .finally(() => {
        saving.value = false;
      });
    return;
  }

  refForm.value.validate((v) => {
    if (v) {
      const apiPath = action.value == "new" ? "/admin/api-key/apply" : "/admin/api-key/update";
      proxy.$http
        .post(apiPath, form)
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

const menuAction = (action, row) => {
  switch (action) {
    case "recharge":
      recharge(row);
      break;
    case "edit":
      edit(row);
      break;
    case "rest":
      modal.confirm({
        title: "Please confirm",
        content: $t("keys.tip_reset"),
        onOk: () => {
          rest(row);
        },
      });
      break;
    case "delete":
      modal.confirm({
        title: "Please confirm",
        content: $t("keys.tip_delete"),
        onOk: () => {
          del(row);
        },
      });
      break;
    case "models":
      listModels(row);
      break;
  }
};

onMounted(() => {
  get_data();
  loadGroups();
});
</script>
<style lang="less">
.my-keys {
  th {
    word-break: keep-all !important;
  }
}
</style>
