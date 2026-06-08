import koRobot from './src/ko/robot.json'
import enRobot from './src/en/robot.json'
import jaRobot from './src/ja/robot.json'
import koRoute from './src/ko/route.json'
import enRoute from './src/en/route.json'
import jaRoute from './src/ja/route.json'

export const translations = {
  ko: { robot: koRobot, route: koRoute },
  en: { robot: enRobot, route: enRoute },
  ja: { robot: jaRobot, route: jaRoute }
}
