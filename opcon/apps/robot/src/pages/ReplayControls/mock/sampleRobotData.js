// mock/sampleRobotData.js
export const sampleRobotData = {
  // ── Left arm joint positions (deg)
  la_j1_pos: 10,
  la_j2_pos: -25,
  la_j3_pos: 60,
  la_j4_pos: 15,
  la_j5_pos: -40,
  la_j6_pos: 5,

  // ── Right arm joint positions (deg)
  ra_j1_pos: -12,
  ra_j2_pos: -30,
  ra_j3_pos: 55,
  ra_j4_pos: -10,
  ra_j5_pos: -35,
  ra_j6_pos: 0,

  // ── Temperatures (°C)
  la_j1_temp: 39,
  la_j2_temp: 42,
  la_j3_temp: 58, // 🔴 error 강조
  la_j4_temp: 44,
  la_j5_temp: 41,
  la_j6_temp: 40,

  ra_j1_temp: 38,
  ra_j2_temp: 40,
  ra_j3_temp: 45, // 🟡 warn
  ra_j4_temp: 39,
  ra_j5_temp: 37,
  ra_j6_temp: 36,

  // ── Torque (Nm)
  la_j1_torque: 0.8,
  la_j2_torque: 1.1,
  la_j3_torque: 2.9, // warn
  la_j4_torque: 0.7,
  la_j5_torque: 0.6,
  la_j6_torque: 0.3,

  ra_j1_torque: 0.6,
  ra_j2_torque: 0.9,
  ra_j3_torque: 2.2,
  ra_j4_torque: 0.5,
  ra_j5_torque: 0.4,
  ra_j6_torque: 0.2,

  // ── End-effector
  la_ee_type: 'hand',
  ra_ee_type: 'gripper',

  la_hand_stability: 72,
  ra_gripper_pos: 18,

  la_is_grasping: true,
  ra_is_grasping: false,

  // ── Mobile base
  base_vel_linear: 0.42,
  base_heading: 128
}
