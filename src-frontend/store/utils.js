import id from "hash-sum";
export const getView = (state, route) => {
  let { path, fullPath, query, params, meta, name, icon, loading } = route;
  const view = {
    key: id(fullPath),
    loading: loading === undefined ? true : false,
    path,
    fullPath,
    query: { ...query },
    params,
    meta: { ...meta },
    name,
    icon,
  };
  const server = view.query.server || "";
  let index = -1;
  view.meta.keepAlive = true;
  if (server) {
    view.meta.title = server;
    index = state?.views.findIndex((x) => x.fullPath == view.fullPath);
  } else {
    index = state?.views.findIndex((x) => x.path == view.path);
  }
  return { view, index, keepViewKey: view.name };
};

export const updateLocalRoutes = (state) => {
  let routes = state.views.map(
    ({ icon, fullPath, params, name, query, path, meta, key, loading }) => {
      return {
        key: key || id(fullPath),
        loading,
        icon,
        fullPath,
        name,
        query,
        path,
        meta,
        params,
      };
    }
  );
  localStorage.setItem("routes", JSON.stringify(routes));
};
