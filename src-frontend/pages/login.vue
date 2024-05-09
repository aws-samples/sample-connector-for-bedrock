<template>
  <div class="login">
    <div class="login-box">
      <h1>{{ $t('login.title') }}</h1>
      <Form size="large" :model="form" :rules="rules" layout="vertical" @submit="login" theme="light">
        <FormItem label="Host" prop="host">
          <Input type="text" placeholder="https://" />
        </FormItem>
        <FormItem label="API Key" prop="key">
          <Input type="password" placeholder="Please input api key..." />
        </FormItem>
        <FormItem class="btn">
          <Button type="primary" :loading="loading" htmlType="submit">{{ $t('login.btn') }}</Button>
        </FormItem>
      </Form>
    </div>
  </div>
</template>
<script>
export default {
  data() {
    return {
      loading: false,
      form: { key: '', host: '' },
      rules: {
        key: [{ required: true, message: 'Please input key...' }]
      }
    }
  },
  created() {
    this.form.host = localStorage.getItem("host") || ''
  },
  methods: {
    login({ valid }) {
      if (!valid) {
        return false;
      }
      let { host, key } = this.form;
      if (host.endsWith("/")) {
        host = host.substring(0, host.length - 1);
      }
      if (!host) {
        return this.$Message.error('Please input he host')
      }
      this.loading = true;
      this.$http.get(host + '/user/api-key/mine', null, key).then(res => {
        // console.log(res);
        if (res.success) {
          const userInfo = {
            key: key,
            name: res.data.name,
            role: res.data.role,
            host: host
          }
          this.$store.commit('user/login', userInfo)
          localStorage.setItem("key", key);
          localStorage.setItem("name", res.data.name);
          localStorage.setItem("role", res.data.role);
          localStorage.setItem("host", host);

          // this.$router.push('/')
          window.location.href = ''
        } else {
          alert(res.data);
        }
      }).finally(() => {
        this.loading = false
      });

    }
  }
}
</script>
<style lang="less">
.login {
  width: 100%;
  height: 100%;
  position: relative;

  &::before {
    content: '';
    background: #252F3E;
    background-repeat: no-repeat;
    background-size: cover;
    width: 100%;
    height: 100%;
    display: table;
    z-index: 0;
  }

  &::after {
    display: table;
    content: '';
    width: 100%;
    height: 100%;
    backdrop-filter: blur(10px);
    background-color: #46464647;
    z-index: 1;
    position: absolute;
    left: 0;
    top: 0;
    z-index: 1;
  }

  .login-box {
    background-color: #ffffff;
    width: 500px;
    height: 300px;
    position: absolute;
    z-index: 100;
    top: 50%;
    border-radius: 16px;
    right: 20%;
    transform: translateY(-50%);
    padding: 30px;
  }

  .k-input[mult] .k-input-text {
    height: 38px;
  }

  .btn .k-form-item-content {
    justify-content: end;
  }
}
</style>