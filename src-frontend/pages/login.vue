<template>
  <div class="login">
    <div class="login-box">
      <h1>{{ $t("login.title") }}</h1>
      <Form
        size="large"
        :model="form"
        :rules="rules"
        layout="vertical"
        ref="refForm"
        @submit="login"
      >
        <FormItem label="Host" prop="host">
          <Input type="text" placeholder="https://" />
        </FormItem>
        <FormItem label="API Key" prop="key">
          <Input type="password" placeholder="Please input api key..." @keyup.enter="toLogin" />
        </FormItem>
      </Form>
      <Button
        type="primary"
        block
        class="btn-login"
        size="large"
        :loading="loading"
        @click="toLogin"
      >
        {{ $t("login.btn") }}
      </Button>
    </div>
  </div>
</template>
<script setup>
import { ref, reactive, onMounted, getCurrentInstance, inject } from "vue";
import { message } from "kui-vue";
const { proxy } = getCurrentInstance();
const loading = ref(false);
const $t = inject("$t");

const refForm = ref();
const form = reactive({
  key: "",
  host: "",
});

const rules = {
  key: [{ required: true, message: "Please input key..." }],
};

onMounted(() => {
  const host = localStorage.getItem("host") || "https://";
  if (host.indexOf("http://") > -1 || host.indexOf("https://") > -1) {
    form.host = host;
  }
});
const toLogin = () => {
  refForm.value.submit();
};
const login = ({ valid }) => {
  if (!valid) {
    return false;
  }
  let { host, key } = form;
  if (host.endsWith("/")) {
    host = host.substring(0, host.length - 1);
  }
  if (!host) {
    return message.error("Please input the host");
  }
  loading.value = true;
  proxy.$http
    .get(host + "/user/api-key/mine", null, key)
    .then((res) => {
      // console.log(res);
      if (res.success) {
        const userInfo = {
          key: key,
          name: res.data.name,
          role: res.data.role,
          host: host,
        };
        proxy.$store.commit("user/login", userInfo);
        localStorage.setItem("key", key);
        localStorage.setItem("name", res.data.name);
        localStorage.setItem("role", res.data.role);
        localStorage.setItem("host", host);

        proxy.$router.push('/')
      } else {
        alert(res.data);
      }
    })
    .finally(() => {
      loading.value = false;
    });
};
</script>
<style lang="less">
.login {
  width: 100%;
  height: 100%;
  position: relative;
  background-color: var(--kui-color-bg-layout);
  .login-box {
    background-color: var(--kui-color-bg-container);
    width: 390px;
    position: absolute;
    z-index: 100;
    top: 50%;
    border-radius: 16px;
    left: 50%;
    transform: translateY(-50%) translateX(-50%);
    padding: 30px;
  }
  .btn-login {
    margin: 20px 2px 0px 2px;
  }
}
</style>
