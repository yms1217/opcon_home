// components/RobotVisualizationDemo.jsx
import RobotVisualization from './RobotVisualization'
import { sampleRobotData } from '../mock/sampleRobotData'

export default function RobotVisualizationDemo() {
  return (
    <div style={{ height: '420px', width: '100%' }}>
      <RobotVisualization
        data={sampleRobotData}
        config={{
          leftArm: { eeType: 'hand' },
          rightArm: { eeType: 'gripper' }
        }}
      />
    </div>
  )
}
