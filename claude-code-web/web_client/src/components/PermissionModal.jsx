function PermissionModal({ permission, onRespond }) {
  return (
    <div className="modal">
      <div className="modal-content">
        <h3>🔒 Permission Required</h3>
        <div className="permission-info">
          <p><strong>Tool:</strong> {permission.tool_name}</p>
          <p><strong>Input:</strong></p>
          <pre>{JSON.stringify(permission.tool_input, null, 2)}</pre>
        </div>
        <div className="modal-actions">
          <button
            onClick={() => onRespond(permission.request_id, true)}
            className="btn btn-success"
          >
            Allow
          </button>
          <button
            onClick={() => onRespond(permission.request_id, false)}
            className="btn btn-danger"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  )
}

export default PermissionModal
