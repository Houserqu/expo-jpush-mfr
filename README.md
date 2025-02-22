# Expo-Jpush-MFR

本库是 frok [jpush-react-native](https://github.com/jpush/jpush-react-native) 而来，在官方库的基础上增加了对厂商推送的支持，以及适配了基于 expo 开发的 app，省去了手动去修改原生代码。

目前支持的厂商：小米、vivo、oppo、荣耀、华为

## 1. 安装

```
npm install expo-jpush-mfr --save
```

* 注意：如果项目里没有 jcore-react-native，需要安装

```
npm install jcore-react-native --save
```

## 2. 配置

在 app.json 中配置插件和极光推送和厂商推送的参数
```
[
  "expo-jpush-mfr",
  {
    "appKey": "极光的 appKey",
    "channel": "极光的通道",
    "mfr": {
      "VIVO_APPKEY": "厂商配置参数",
      "VIVO_APPID": "厂商配置参数",
      "XIAOMI_APPID": "厂商配置参数",
      "XIAOMI_APPKEY": "厂商配置参数",
      "OPPO_APPKEY": "厂商配置参数",    // 不需要 OP-前缀
      "OPPO_APPID": "厂商配置参数",     // 不需要 OP-前缀
      "OPPO_APPSECRET": "厂商配置参数", // 不需要 OP-前缀
      "HONOR_APPID": "厂商配置参数"
    }
  }
]
```

## 3. 使用

JS 代码的使用请参考官方库 [jpush-react-native](https://github.com/jpush/jpush-react-native)
