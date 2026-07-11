/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    { schema: 'trips', name: 'audit_log' },
    {
      id: 'id',
      table_name: { type: 'text', notNull: true },
      record_id: { type: 'integer', notNull: true },
      action: { type: 'text', notNull: true },
      actor_type: { type: 'text', notNull: true },
      actor_id_or_context: { type: 'text' },
      old_values: { type: 'jsonb' },
      new_values: { type: 'jsonb' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    }
  );

  pgm.addConstraint({ schema: 'trips', name: 'audit_log' }, 'audit_log_action_chk', {
    check: "action IN ('insert', 'update', 'delete')",
  });

  pgm.addConstraint({ schema: 'trips', name: 'audit_log' }, 'audit_log_actor_type_chk', {
    check: "actor_type IN ('user', 'mcp')",
  });

  pgm.createIndex({ schema: 'trips', name: 'audit_log' }, ['table_name', 'record_id']);
  pgm.createIndex({ schema: 'trips', name: 'audit_log' }, 'created_at');
};

exports.down = (pgm) => {
  pgm.dropTable({ schema: 'trips', name: 'audit_log' });
};
