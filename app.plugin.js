const { withAndroidManifest, withAppBuildGradle, withSettingsGradle, withInfoPlist, withAppDelegate, withProjectBuildGradle, withDangerousMod, withGradleProperties } = require('@expo/config-plugins');
const fs = require('fs');
const { console } = require('inspector');
const path = require('path');

const withJpush = (config, { appKey, channel, mfr }) => {
  config = withAndroidManifest(config, async (config) => {
    let androidManifest = config.modResults.manifest;
    androidManifest.application[0]["meta-data"].push({
      '$': {
        "android:name": "JPUSH_CHANNEL",
        "android:value": channel
      }
    })
    androidManifest.application[0]["meta-data"].push({
      '$': {
        "android:name": "JPUSH_APPKEY",
        "android:value": appKey
      }
    })
    return config;
  });

  config = withProjectBuildGradle(config, async (config) => {
    const lines = config.modResults.contents.split('\n')
    const newLines = []
    lines.forEach(line => {
      if (line.includes('mavenCentral')) {
        newLines.push(`        maven {url 'https://developer.huawei.com/repo/'}`)
      } if (line.includes('com.android.tools.build:gradle')) {
        newLines.push(`        classpath('com.android.tools.build:gradle:7.0.2')`)
        newLines.push(`        classpath('com.huawei.agconnect:agcp:1.9.1.301')`)
      } else {
        newLines.push(line)
      }
    })

    config.modResults.contents = newLines.join('\n')

    return config;
  })

  config = withAppBuildGradle(config, async (config) => {
    const lines = config.modResults.contents.split('\n')
    const newLines = []
    lines.forEach(line => {
      if (line.includes('dependencies')) {
        newLines.push(line)
        newLines.push(`    implementation project(':expo-jpush-mfr')`)
        newLines.push(`    implementation project(':jcore-react-native')`)
      } else if (line.includes('defaultConfig {')) {
        newLines.push(line)
        newLines.push(`
        manifestPlaceholders = [
            VIVO_APPKEY : "${mfr.VIVO_APPKEY}", // VIVO平台注册的appkey
            VIVO_APPID : "${mfr.VIVO_APPID}", // VIVO平台注册的appid

            XIAOMI_APPID : "${mfr.XIAOMI_APPID}", // 小米平台注册的appid，xiaomi-v5.5.3版本开始，不需要添加前缀 “MI-”
            XIAOMI_APPKEY : "${mfr.XIAOMI_APPKEY}",// 小米平台注册的appkey，xiaomi-v5.5.3版本开始，不需要添加前缀 “MI-”

            OPPO_APPKEY : "OP-${mfr.OPPO_APPKEY}", // OPPO平台注册的appkey
            OPPO_APPID : "OP-${mfr.OPPO_APPID}", // OPPO平台注册的appid
            OPPO_APPSECRET: "OP-${mfr.OPPO_APPSECRET}", //OPPO平台注册的appsecret

            HONOR_APPID: "${mfr.HONOR_APPID}", // 荣耀
        ]
        `)
      } else {
        newLines.push(line)
      }
    })

    newLines.push(`apply plugin: 'com.huawei.agconnect'`)

    config.modResults.contents = newLines.join('\n')

    return config;
  })

  config = withSettingsGradle(config, async (config) => {
    const lines = config.modResults.contents.split('\n')
    lines.push(`include ':expo-jpush-mfr'`)
    lines.push(`project(':expo-jpush-mfr').projectDir = new File(rootProject.projectDir, '../node_modules/expo-jpush-mfr/android')`)
    lines.push(`include ':jcore-react-native'`)
    lines.push(`project(':jcore-react-native').projectDir = new File(rootProject.projectDir, '../node_modules/jcore-react-native/android')`)

    config.modResults.contents = lines.join('\n')

    return config
  })

  config = withInfoPlist(config, config => {
    // 添加通知权限
    const infoPlist = config.ios.infoPlist || {}
    infoPlist["UIBackgroundModes"] = ["fetch", "remote-notification"]
    config.ios.infoPlist = infoPlist
    return config
  })

  config = withAppDelegate(config, config => {
    let contents = config.modResults.contents || '';

    // 替换默认获取 deviceToken 代码
    contents = contents.replace(
      `return [super application:application didRegisterForRemoteNotificationsWithDeviceToken:deviceToken];`,
      `[JPUSHService registerDeviceToken:deviceToken];`
    )

    contents = contents.replace(
      `return [super application:application didReceiveRemoteNotification:userInfo fetchCompletionHandler:completionHandler];`,
      `// iOS 10 以下 Required
  NSLog(@"iOS 7 APNS");
  [JPUSHService handleRemoteNotification:userInfo];
  [[NSNotificationCenter defaultCenter] postNotificationName:J_APNS_NOTIFICATION_ARRIVED_EVENT object:userInfo];
  completionHandler(UIBackgroundFetchResultNewData);`
    )

    // 添加推送初始化代码
    const lines = contents.split('\n')
    const newLines = []
    lines.forEach(line => {
      if (line.includes('#import <React/RCTBundleURLProvider.h>')) {
        newLines.push(`
// 添加内容start
#import <RCTJPushModule.h>
#import <React/RCTBridge.h>
#import <React/RCTRootView.h>

#ifdef NSFoundationVersionNumber_iOS_9_x_Max
#import <UserNotifications/UserNotifications.h>
#endif
// 添加内容end
          `)
        newLines.push(line)
      } else if (line.includes('#import <React/RCTLinkingManager.h>')) {
        newLines.push(line)
        newLines.push(`
// 添加内容start
@interface AppDelegate ()<JPUSHRegisterDelegate>
@end
// 添加内容end
          `)
      } else if (line.includes("self.initialProps = @{};")) {
        newLines.push(line)
        newLines.push(`
   // 添加内容start APNS
  JPUSHRegisterEntity * entity = [[JPUSHRegisterEntity alloc] init];
  if (@available(iOS 12.0, *)) {
    // entity.types = JPAuthorizationOptionNone; //JPAuthorizationOptionAlert|JPAuthorizationOptionBadge|JPAuthorizationOptionSou//nd|JPAuthorizationOptionProvidesAppNotificationSettings;
    entity.types = JPAuthorizationOptionAlert|JPAuthorizationOptionBadge|JPAuthorizationOptionSound;
  }
  [JPUSHService registerForRemoteNotificationConfig:entity delegate:self];
        `)
      } else if (line === '@end') {
        newLines.push(`
//************************************************JPush start************************************************

//iOS 10 前台收到消息
- (void)jpushNotificationCenter:(UNUserNotificationCenter *)center  willPresentNotification:(UNNotification *)notification withCompletionHandler:(void (^)(NSInteger))completionHandler {
  NSDictionary * userInfo = notification.request.content.userInfo;
  if([notification.request.trigger isKindOfClass:[UNPushNotificationTrigger class]]) {
    // Apns
    NSLog(@"iOS 10 APNS 前台收到消息");
    [JPUSHService handleRemoteNotification:userInfo];
    [[NSNotificationCenter defaultCenter] postNotificationName:J_APNS_NOTIFICATION_ARRIVED_EVENT object:userInfo];
  }
  else {
    // 本地通知 todo
    NSLog(@"iOS 10 本地通知 前台收到消息");
    [[NSNotificationCenter defaultCenter] postNotificationName:J_LOCAL_NOTIFICATION_ARRIVED_EVENT object:userInfo];
  }
  //需要执行这个方法，选择是否提醒用户，有 Badge、Sound、Alert 三种类型可以选择设置
  completionHandler(UNNotificationPresentationOptionAlert);
}

//iOS 10 消息事件回调
- (void)jpushNotificationCenter:(UNUserNotificationCenter *)center didReceiveNotificationResponse:(UNNotificationResponse *)response withCompletionHandler: (void (^)(void))completionHandler {
  NSDictionary * userInfo = response.notification.request.content.userInfo;
  if([response.notification.request.trigger isKindOfClass:[UNPushNotificationTrigger class]]) {
    // Apns
    NSLog(@"iOS 10 APNS 消息事件回调");
    [JPUSHService handleRemoteNotification:userInfo];
    // 保障应用被杀死状态下，用户点击推送消息，打开app后可以收到点击通知事件
    [[RCTJPushEventQueue sharedInstance]._notificationQueue insertObject:userInfo atIndex:0];
    [[NSNotificationCenter defaultCenter] postNotificationName:J_APNS_NOTIFICATION_OPENED_EVENT object:userInfo];
  }
  else {
    // 本地通知
    NSLog(@"iOS 10 本地通知 消息事件回调");
    // 保障应用被杀死状态下，用户点击推送消息，打开app后可以收到点击通知事件
    [[RCTJPushEventQueue sharedInstance]._localNotificationQueue insertObject:userInfo atIndex:0];
    [[NSNotificationCenter defaultCenter] postNotificationName:J_LOCAL_NOTIFICATION_OPENED_EVENT object:userInfo];
  }
  // 系统要求执行这个方法
  completionHandler();
}

//自定义消息
- (void)networkDidReceiveMessage:(NSNotification *)notification {
  NSDictionary * userInfo = [notification userInfo];
  [[NSNotificationCenter defaultCenter] postNotificationName:J_CUSTOM_NOTIFICATION_EVENT object:userInfo];
}

//************************************************JPush end************************************************  
        `)
        newLines.push(line)

      } else {
        newLines.push(line)
      }
    })

    config.modResults.contents = newLines.join('\n')

    return config
  })

  config = withGradleProperties(config, config => {
    config.modResults.push(
      {
        type: 'property',
        key: "apmsInstrumentationEnabled",
        value: "false"
      }
    )
    return config
  })

  // 复制华为推送配置文件
  if (mfr.HUAWEI_AGCONNECT_SERVICES_FILE) {
    withDangerousMod(config, [
      'android',
      async config => {
        fs.copyFile(
          path.join(config._internal.projectRoot, mfr.HUAWEI_AGCONNECT_SERVICES_FILE),
          path.join(config._internal.projectRoot, 'android/app/agconnect-services.json'),
          (err) => {
            if (err) {
              console.log("复制华为推送配置文件失败：", err)
            }
          }
        )
        return config;
      },
    ]);
  }

  return config;
};

module.exports = withJpush