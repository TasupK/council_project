// Settings 부서 조직도 조회 모델 생성
function buildSettingsDepartmentChart_() {
  var departments = listActiveDepartments_();
  var departmentIndex = {};
  departments.forEach(function (department) {
    departmentIndex[department.id] = {
      id: department.id,
      name: department.name,
      type: department.type,
      members: []
    };
  });

  var users = listUsersForSettings_();
  var unassigned = [];

  users.forEach(function (user) {
    var permissions = buildUserPermissionsFromDb_(user.roleIds || []);
    var member = {
      email: user.email,
      name: user.name,
      status: user.status,
      roles: user.roles || [],
      permissionAreas: (permissions.menus || []).map(function (menu) { return menu.name || menu.group || menu.id; })
    };
    if (user.departmentId && departmentIndex[user.departmentId]) {
      departmentIndex[user.departmentId].members.push(member);
    } else {
      unassigned.push(member);
    }
  });

  function memberSort_(a, b) {
    var aRole = a.roles && a.roles.length ? a.roles[0].name : '';
    var bRole = b.roles && b.roles.length ? b.roles[0].name : '';
    if (aRole !== bRole) return aRole.localeCompare(bRole);
    return a.name.localeCompare(b.name);
  }

  var departmentGroups = departments.map(function (department) {
    var group = departmentIndex[department.id];
    group.members.sort(memberSort_);
    return group;
  });
  unassigned.sort(memberSort_);

  var roleMap = buildRolesById_();
  return {
    summary: {
      totalUsers: users.length,
      activeUsers: users.filter(function (user) { return user.status === 'active'; }).length,
      departmentCount: departments.length,
      roleCount: Object.keys(roleMap).length
    },
    departments: departmentGroups,
    unassigned: unassigned
  };
}
