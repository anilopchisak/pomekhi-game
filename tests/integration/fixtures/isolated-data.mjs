// Test-only process isolation; executable code keeps its normal data-directory behavior.
if (process.env.POMEKHI_TEST_DIRECTORY) process.chdir(process.env.POMEKHI_TEST_DIRECTORY);
