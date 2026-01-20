/**
 * Qiu
 */
// import FileSaver from 'file-saver';
// const XLSX = require('xlsx');
import { message, notice } from "kui-vue";
const http = {
  _maps: {},
  cancel: function () {
    for (const id in this._maps) {
      this._maps[id].abort();
      delete this._maps[id];
    }
  },
};
const filter_null = (obj) => {
  for (let key in obj) {
    if (obj[key] === null || obj[key] === undefined || obj[key] === "") {
      delete obj[key];
    }
  }
  return obj;
};
http._base = (method, url, data, api_key) => {
  const controller = new AbortController();
  const key = Date.now() * 1;
  http._maps[key] = controller;
  return new Promise((res, rej) => {
    let options = {
      method: method,
      signal: controller.signal,
      headers: {},
    };
    options.headers["Authorization"] =
      "Bearer " + (api_key || localStorage.getItem("key"));
    if (!url.startsWith("http")) {
      let host = localStorage.getItem("host");
      // key = localStorage.getItem('key')
      if (!host) {
        host = "/";
        // throw new Error("Needs host.")
      }
      if (host.startsWith("/")) {
        host = host.substring(0, host.length - 1);
      }
      url = host + url;
    }
    if (method == "post" || method == "put") {
      if (data instanceof FormData) {
        options.body = data;
      } else if (typeof data === "object" || Array.isArray(data)) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(data);
      } else {
        options.body = data;
      }
    } else {
      if (data) {
        let obj = filter_null(data);
        // console.log(obj)
        let { search } = new URL("https://" + url);
        url += (search ? "&" : "?") + new URLSearchParams(obj).toString();
      }
    }
    fetch(url, options)
      .then((r) => {
        // console.log(r)
        if (r.ok) {
          return r.json();
        } else {
          throw new Error(r.statusText);
        }
      })
      .then((data) => {
        if (!data.success) {
          message.destroy();
          message.error(data.data);
          rej(data);
          return;
        }
        res(data);
      })
      .catch((err) => {
        notice.destroy();
        notice.error({
          title: "Prompt",
          content: err.message || "Internal Server Error",
        });
        rej(err);
      })
      .finally(() => {
        delete http._maps[key];
      });
  });
};

["get", "post", "put", "delete"].forEach((m) => {
  http[m] = (url, data, api_key) => http._base(m, url, data, api_key);
});

export default http;
