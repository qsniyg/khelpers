const config = require('dotenv').config();
const Discord = require("discord.js");
const client = new Discord.Client();
const fastify = require('fastify')();
const monk = require('monk');
var db = monk("localhost/live_discord?auto_reconnect=true");
var db_stars = db.get("stars");
var db_accounts = db.get("accounts");
var db_rules = db.get("rules");
var db_messages = db.get("messages");
var db_guilds = db.get("guilds");

//db_stars.remove({});
//db_accounts.remove({});
//db_rules.remove({});
//db_messages.remove({});
//db_guilds.remove({});

if (false) {
  db_rules.find({}).then(
    rules => {
      console.log(rules);
    }
  );
}

var bot_guild;
var self_userid;

var subscribe_emoji = '✉';
var unsubscribe_emoji = '❌';

var msgs = {
  command_helpsuffix: {
    en: "*Type* `%%{help_command}` *for a list of commands*",
    kr: "`%%{help_command}` *입력하시면 명령 목록을 표시합니다*"
  },
  help_command: {
    en: "help",
    kr: "도움말"
  },
  help_for_more_info: {
    en: "use the `%%{help_command}` command for more information",
    kr: "자세한 정보 보려면 `%%{help_command}` 입력하십시오"
  },
  help_for_more_info_upper: {
    en: "Use the `%%{help_command}` command for more information",
    kr: "%%{help_for_more_info}"
  },
  help_kr_header: {
    en: "한국어 번역 보려면 `도움말` 입력하십시오",
    kr: "저 (개발자) 외국인이라 오역이 있으면 죄송합니다 알려주시면 감사하겠습니다"
  },
  subscribedto: {
    en: "Subscribed to **%%1**",
    kr: "**%%1** 구독합니다"
  },
  alreadysubscribedto: {
    en: "Already subscribed to **%%1**",
    kr: "**%%1** 이미 구독합니다"
  },
  dm_subscribedto: "%%{subscribedto}%%{command_helpsuffix}",
  discord_invite_msg: {
    en: "*Join the LiveBot server here:* %%1",
    kr: "*LiveBot 서버 초대 링크는* %%1"
  },
  removed_rule: {
    en: "Removed rule #**%%1**",
    kr: "구독 #**%%1** 취소합니다"
  },
  rule_not_found: {
    en: "Rule #**%%1** not found",
    kr: "구독 #**%%1** 찾지 못합니다"
  },
  unknown_error: {
    en: "Unknown error",
    kr: "알 수 없는 오류가 발생했습니다"
  },
  livebotadmin_needed: {
    en: "You need the `LiveBotAdmin` role to modify the bot's settings for the guild",
    kr: "이 서버에 대한 설정 변경하려면 `LiveBotAdmin`라는 역할 필요합니다"
  },
  unterminated_quote: {
    en: "Unterminated quote?",
    kr: "따옴표 누락되었습니다"
  },
  replays_help: {
    en: [
      "The `with_replays` argument determines whether or not replays are included. Possible values:",
      "",
      "    * `true`  - Subscribes to both livestreams and replays",
      "    * `false` - Only subscribes to livestreams",
      "    * `only`  - Only subscribes to replays"
    ].join("\n"),
    kr: [
      "`다시보기포함` 속성에 가능한 값은",
      "",
      "    * `true`  - 라이브이랑 다시보기를 구독하기",
      "    * `false` - 라이브만 구독하기",
      "    * `only`  - 다시보기만 구독하기"
    ].join("\n")
  },
  replays_needs_values: {
    en: "The `with_replays` argument needs to be one of `true`, `false`, or `only`",
    kr: "`다시보기포함` 속성에 가능한 값은 `true`, `false`, `only`입니다"
  },
  help_shorthelp: {
    en: "This message",
    kr: "이 메시지"
  },
  help_longhelp: {
    en: [
      "This message (and the commands) vary on whether you're contacting the bot via DM, or if you're in a server you own.",
      "Commands sent in a DM affect personal notifications, while commands sent in a server will affect that server."
    ].join("\n"),
    kr: "DM으로 이 봇을 사용하시면 전송하신 명령은 개인적인 알림을 변경하는데 서버로 사용하시면 서버의 알림 설정을 번경합니다"
  },
  list_command: {
    en: "list",
    kr: "목록"
  },
  list_you_help: {
    en: "Lists the lives you're currently subscribed to",
    kr: "구독 표시하기"
  },
  list_server_help: {
    en: "Lists the lives your server is currently subscribed to",
    kr: "구독 표시하기"
  },
  subscribe_you_shorthelp: {
    en: "Subscribes yourself to a person's lives or replays",
    kr: "라이브 또는 다시보기를 구독하기"
  },
  subscribe_you_args: {
    en: "group_and_member_name with_replays",
    kr: "그룹과멤버이름 다시보기포함"
  },
  subscribe_command: {
    en: "subscribe",
    kr: "구독"
  },
  subscribe_you_examples: [
    "%%{examples}",
    "",
    "       `%%{subscribe_command} 'snsd taeyeon' true`",
    "       `%%{subscribe_command} \"girl's generation taeyeon\" true`",
    "       `%%{subscribe_command} \"Girls Generation Taeyeon\" true`",
    "       `%%{subscribe_command} '소녀시대 태연' true`",
  ].join("\n"),
  group_membername_help: {
    en: "`group_and_member_name` needs to be quoted, but spacing, punctuation, and casing is ignored.",
    kr: "`그룹과멤버이름`에 여러 단어가 포함된 경우에는 단어 앞뒤에 따옴표를 사용하십시오. 공백과 글점 무시됩니다",
  },
  subscribe_username_ok_help: {
    en: "You can also subscribe by their username (for example: `%%{subscribe_command} 'taeyeon_ss' true`), however, this is still limited to the accounts available in the bot's database.",
    kr: "인스타 아이디로 구독해도 되는데 (예를 들어서 `%%{subscribe_command} 'taeyeon_ss' true`), 봇의 DB에 없는 계정을 구독할 수 없습니다."
  },
  examples: {
    en: "Examples:",
    kr: "예시는"
  },
  subscribe_you_longhelp: [
    "%%{group_membername_help}",
    "",
    "%%{replays_help}",
    "",
    "%%{subscribe_you_examples}",
    "",
    "%%{subscribe_username_ok_help}"
  ].join("\n"),
  subscribe_guild_args: {
    en: "channel_id group_and_member_name with_replays [ping_role_id]",
    kr: "채널ID 그룹과멤버이름 다시보기포함 알림역할ID"
  },
  subscribe_guild_shorthelp: {
    en: "Subscribes a channel to a person's lives or replays",
    kr: "라이브 또는 다시보기를 구독하기"
  },
  subscribe_guild_examples: [
    "%%{examples}",
    "",
    "       `%%{subscribe_command} 123456 'snsd taeyeon' true 7890`",
    "       `%%{subscribe_command} 123456 \"girl's generation taeyeon\" true`",
    "       `%%{subscribe_command} 123456 \"Girls Generation Taeyeon\" true 7890`",
    "       `%%{subscribe_command} 123456 '소녀시대 태연' true`"
  ].join("\n"),
  find_channelid: {
    en: "To find the `channel_id`, enable Developer Mode, right click on the channel, and select 'Copy ID'.",
    kr: "`채널ID` 찾으려면 '개발자 모드' 사용하고 채널을 마우스 오른쪽 버튼으로 클릭하고 'ID 복사' 선택하십시오."
  },
  ping_role_help: {
    en: [
      "`ping_role_id` is optional, but if specified, the specified role will be pinged.",
      "    To find the role ID, make sure the rule can be pinged, and write `\\@rolename`. After sending, if the message is `<@&12345>`, the role ID is `12345`."
    ].join("\n"),
    kr: [
      "`알림역할ID` 선택사항인데 지정하면 선택된 역할 사용자들에게 알림 뜰 것 입니다.",
      "    역할ID 찾으려면 '아무나 @mention을 허용' 사용하고 `\\@rolename` 입력하십시오. `<@&12345>` 보이면 역할 ID는 `12345` 입니다."
    ].join("\n")
  },
  subscribe_guild_longhelp: [
    "%%{find_channelid}\n",
    "%%{group_membername_help}\n",
    "%%{replays_help}\n",
    "%%{ping_role_help}\n",
    "%%{subscribe_guild_examples}\n",
    "%%{subscribe_username_ok_help}"
  ].join("\n"),
  commands_available: {
    en: "**Commands available:**\n\n",
    kr: "**명령:**\n\n"
  },
  unsubscribe_args: {
    en: "ruleid",
    kr: "구독ID"
  },
  unsubscribe_shorthelp: {
    en: "Removes a subscription",
    kr: "구독 취소하기"
  },
  unsubscribe_command: {
    en: "unsubscribe",
    kr: "취소"
  },
  unsubscribe_examples: [
    "%%{examples}",
    "",
    "       `%%{unsubscribe_command} 12345`"
  ].join("\n"),
  unsubscribe_longhelp: {
    en: [
      "The `rule_id` can be found using the `%%{list_command}` command",
      "",
      "%%{unsubscribe_examples}"
    ].join("\n"),
    kr: [
      "`%%{list_command}` 입력하면 `구독ID` 찾을 수 있어요",
      "",
      "%%{unsubscribe_examples}"
    ].join("\n")
  },
  at_least_n_arguments: {
    en: "Needs at least %%1 arguments (%%{help_for_more_info})",
    kr: "속성이 최소한 %%1개 필요합니다 (%%{help_for_more_info})"
  },
  invalid_with_replays: {
    en: "Invalid value for `with_replays`.",
    kr: "`다시보기포함` 잘못되었습니다."
  },
  forget_quotes: {
    en: "Did you forget to add quotes around `group_and_member_name`? %%{help_for_more_info_upper}",
    kr: "`그룹과멤버이름` 뒤앞에 따옴표를 잊었습니까? %%{help_for_more_info_upper}"
  },
  invalid_channel_id: {
    en: "Invalid `channel_id` (make sure you copied the ID, not the name of the channel)",
    kr: "`채널ID` 잘못되었습니다 (채널 이름 아니라 ID 입력하십시오)"
  },
  channel_id_not_exist: {
    en: "The specified channel ID does not exist, or is not accessible by the bot",
    kr: "지정된 채널 ID 존재하지 않습니다 또는 이 봇이 액세스할 수 없습니다"
  },
  invalid_role_id: {
    en: "Invalid `role_id` (make sure you copied the ID, not the name of the role)",
    kr: "`역할ID` 잘못되었습니다 (역학 이름 아니라 ID 입력하십시오)"
  },
  role_does_not_exist: {
    en: "The specified role ID does not exist",
    kr: "지정된 역할 ID 존재하지 않습니다"
  },
  unable_to_find_account: {
    en: "Unable to find `%%1`.\n\nThe account may be in the database, but is not currently accessible to the bot. Use the `#account-suggestions` channel in the LiveBot server to request a new account.",
    kr: "`%%1` 찾을 수 없습니다.\n\n지정된 계정 DB에 있을 수 있는데 이 봇이 현재 액세스할 수 없습니다. LiveBot 서버에 `#account-suggestions` 채널에서 요청하십시오."
  },
  find_rule_id_help: {
    en: "you can find this with the `%%{list_command}` command",
    kr: "`%%{list_command}` 입력하시면 `구독ID` 찾을 수 있습니다"
  },
  needs_rule_id: {
    en: "Needs `rule_id` (%%{find_rule_id_help})",
    kr: "`구독ID` 필요합니다 (%%{find_rule_id_help})"
  },
  invalid_rule_id: {
    en: "Invalid `rule_id` (this should be a number, %%{find_rule_id_help})",
    kr: "`구독ID` 잘못되었습니다 (숫자여야 합니다. %%{find_rule_id_help})"
  },
  rule_does_not_exist: {
    en: "Rule %%1 does not exist",
    kr: "구독 ID %%1 존재하지 않습니다"
  },
  no_rules_found: {
    en: "No rules found",
    kr: "구독 없습니다"
  },
  rules: {
    en: "Rules",
    kr: "구독"
  },
  all_accounts: {
    en: "all accounts",
    kr: "모두"
  },
  list_pings_role: {
    en: "pings %%1",
    kr: "%%1에게 알림이 울립니다"
  },
  list_account_on_channel: {
    en: "**%%1** on `#%%2`",
    kr: "`#%%2`에서 **%%1**"
  },
  with_replays: {
    en: "with replays",
    kr: "라이브, 다시보기"
  },
  only_replays: {
    en: "only replays",
    kr: "다시보기"
  },
  no_replays: {
    en: "no replays",
    kr: "라이브"
  },
  unknown_command: {
    en: "Unknown command (%%{help_for_more_info})",
    kr: "잘못된 명령 (%%{help_for_more_info})"
  },
  lives: {
    en: "lives",
    kr: "라이브"
  },
  replays: {
    en: "replays",
    kr: "다시보기"
  },
  unsubscribed_from: {
    en: "Unsubscribed from **%%1**'s %%2",
    kr: "**%%1** %%2 구독 취소합니다"
  },
  nothing_to_unsubscribe: {
    en: "Nothing to unsubscribe from",
    kr: "그런 구독 없습니다"
  },
  instagram: {
    en: "Instagram",
    kr: "인스타그램"
  },
  periscope: {
    en: "Periscope",
    kr: "페리스코프"
  },
  youtube: {
    en: "Youtube",
    kr: "유튜브"
  },
  afreecatv: {
    en: "AfreecaTV",
    kr: "아프리카TV"
  },
  goldlive: {
    en: "Goldlive",
    kr: "골드라이브"
  },
  noupload: {
    en: "will likely not be uploaded",
    kr: "다시보기 올리지 않을 것입니다"
  },
  is_live_on: {
    en: "**%%1** is live on %%2",
    kr: "**%%1** %%2에서 라이브 시작합니다"
  },
  replay_of: {
    en: "Replay of **%%1**'s %%2 livestream",
    kr: "**%%1** %%2에서 하셨던 라이브 다시보기"
  },
  emoji_subscribe: {
    en: "Use " + subscribe_emoji + " to subscribe to future %%1 by this person",
    kr: subscribe_emoji + " 클릭하시면 이 분의 %%1를 앞으로 알려줄 것입니다"
  },
  emoji_unsubscribe: {
    en: "Use " + unsubscribe_emoji + " to unsubscribe to future %%1 by this person",
    kr: unsubscribe_emoji + " 클릭하시면 이 분의 %%1를 구독 취소합니다"
  }
};

var short_sites = {
  "instagram": "IG",
  "periscope": "PSCOPE",
  "youtube": "YT",
  "afreecatv": "ATV",
  "goldlive": "GOLDL"
};

function _(lang, id) {
  if (lang === "both") {
    var args = Array.from(arguments).slice(1);
    args.unshift("en");
    var en = _.apply(null, args);
    args[0] = "kr";
    return en + "\n" + _.apply(null, args);
  }

  if (lang !== "en" && lang !== "kr") {
    console.log("Warning: _(" + lang + ", " + id + "): lang is not en or kr");
    lang = "en";
  }

  if (!(id in msgs)) {
    console.log("Error: _(" + lang + ", " + id + "): id not in msgs");
    return "";
  }

  var in_command = false;
  var in_bracket = false;
  var out = "";
  var msg = msgs[id];
  if (typeof msg === "object")
    msg = msg[lang];

  for (var i = 0; i < msg.length; i++) {
    var c = msg[i];

    if (in_command !== false) {
      if (i - in_command === 1) {
        if (c === "%") {
          out += "%";
          in_command = false;
        } else if (c === "{") {
          in_bracket = true;
        } else if (!isNaN(parseInt(c))) {
          var arg = arguments[parseInt(c) + 1];

          if (c === "0") {
            console.log("Warning: _(" + lang + ", " + id + "): argument #" + parseInt(c) + " cannot be used");
            arg = "[undefined]";
          }

          if (arg === undefined) {
            console.log("Warning: _(" + lang + ", " + id + "): argument #" + parseInt(c) + " is undefined");
            arg = "[undefined]";
          }

          if (typeof arg !== "string" && typeof arg !== "number") {
            console.log("Warning: _(" + lang + ", " + id + "): argument #" + parseInt(c) + " is not a string or number");
            arg = "[error]";
          }

          out += arg;

          in_command = false;
        } else {
          console.log("Warning: _(" + lang + ", " + id + "): invalid command in msg string");
          in_command = false;
        }
      } else if (in_bracket) {
        if (c === "}") {
          out += _(lang, msg.substr(in_command + 2, i - in_command - 2));
          in_command = false;
        }
      } else {
        console.log("Warning: _(" + lang + ", " + id + "): you shouldn't see this");
      }

      continue;
    }

    if (c === "%") {
      if (i > 0 && msg[i-1] === "%") {
        in_command = i;
        in_bracket = false;
      }

      continue;
    }

    out += c;
  }

  return out;
}

var dm_helptext = "\n\n*Type `help` for a list of commands*";

async function get_sent_message(messageid) {
  var message = await db_messages.find({messageid});
  if (!message || message.length === 0)
    return null;

  return message[0];
}

function upush(array, item) {
  if (item === undefined)
    return;

  if (item instanceof Array) {
    item.forEach((x) => {
      upush(array, x);
    });
  } else {
    /*if (array.indexOf(item) < 0)
      array.push(item);*/
    var sitem = JSON.stringify(item);
    for (var i = 0; i < array.length; i++) {
      if (sitem === JSON.stringify(array[i])) {
        return;
      }
    }
    array.push(item);
  }
}

function uremove(array, item) {
  var sitem = JSON.stringify(item);
  for (var i = 0; i < array.length; i++) {
    if (sitem === JSON.stringify(array[i])) {
      array.splice(i, 1);
      return;
    }
  }
}

function init_message(properties, text, message) {
  if (!properties)
    properties = {type: "other"};

  properties.created_at = Date.now();
  properties.text = text;
  properties.messageid = message.id;

  return properties;
}

function senddm(userid, text, properties) {
  return new Promise((resolve, reject) => {
    client.fetchUser(userid).then(
      user => {
        user.send(text).then(
          message => {
            properties = init_message(properties, text, message);
            properties.user = userid;
            db_messages.insert(properties);

            resolve(message);
          },
          error => {
            console.log("Failed to send message '" + text + "' to user " + userid);
            console.dir(error);

            if (error &&
                error.name === "DiscordAPIError" &&
                error.code === 50007) {
              console.log("User " + userid + " blocked the bot, removing rules to preserve API limits");
              db_rules.remove({
                user: userid
              });
            }

            reject(error);
          }
        );
      },
      error => {
        console.error("Failed to find user " + userid);
        reject(error);
      }
    );
  });
}

async function send_channel(guildid, channelid, text, properties) {
  var guild = client.guilds.get(guildid);
  if (!guild) {
    return null;
  }

  var channel = guild.channels.get(channelid);
  if (!channel) {
    return null;
  }

  var message = await channel.send(text);
  properties = init_message(properties, text, message);
  properties.guild = guildid;
  properties.channel = channelid;

  db_messages.insert(properties);

  return message;
}

async function find_account_by_id(account_id) {
  var account = await db_accounts.find({account_id});
  if (!account || account.length === 0)
    return null;

  return account[0];
}

function find_account(properties) {
  return new Promise((resolve, reject) => {
    if (("site" in properties) &&
        (("username" in properties) ||
         ("uid" in properties))) {
      var query = {
        site: properties.site
      };

      if ("uid" in properties) {
        query.uid = properties.uid;
      } else if ("username" in properties) {
        query.username = properties.username;
      } else {
        return resolve(null);
      }

      db_accounts.find(query).then(
        items => {
          if (!items || items.length === 0) {
            return resolve(null);
          }

          resolve(items[0]);
        },
        err => {
          reject(err);
        });
    } else {
      return resolve(null);
    }
  });
}

function find_star_by_id(id) {
  return new Promise((resolve, reject) => {
    db_stars.find({"star_id": id}).then(
      items => {
        if (!items || items.length === 0)
          return resolve(null);

        resolve(items[0]);
      },
      err => {
        reject(err);
      }
    );
  });
}

function find_star(properties) {
  return new Promise((resolve, reject) => {
    find_account(properties).then(
      account => {
        if (account) {
          return find_star_by_id(account.star_id).then(
            item => {
              if (!item) {
                console.log("Invalid star_id for account:");
                console.log(account);
                reject("invalid_account_star_id");
              } else {
                resolve(item);
              }
            },
            err => {
              reject(err);
            }
          );
        }

        var orquery = [];

        if ("name" in properties) {
          orquery.push({"name": properties.name});
        }

        if (!("search" in properties)) {
          properties.search = create_search(properties);
        }

        if ("search" in properties) {
          if (typeof properties.search === "string") {

            var search = strip_search(properties.search);
            orquery.push({"search": search});
          } else if (properties.search instanceof Array) {
            var search = properties.search;

            for (var i = 0; i < search.length; i++) {
              orquery.push({"search": strip_search(search[i])});
            }
          }
        }

        var query = {};
        if (orquery.length === 0) {
          return resolve(null);
        }

        if (orquery.length === 1) {
          query = orquery[0];
        } else {
          query = {"$or": orquery};
        }

        db_stars.find(query).then(
          items => {
            if (!items || items.length === 0)
              return resolve(null);

            resolve(items[0]);
          },
          err => {
            reject(err);
          }
        );
      },
      err => {
        reject(err);
      }
    );
  });
}

function get_star_accounts(starid) {
  return new Promise((resolve, reject) => {
    db_accounts.find({star_id: starid}).then(
      accounts => {
        if (!accounts || accounts.length === 0)
          return resolve([]);
        else
          resolve(accounts);
      },
      err => reject(err)
    );
  });
}

function strip_search(search) {
  return search.toLowerCase()
    .replace(/[-_'".,!/\s]/g, "")
    .replace(/^\$+/, "");
}

function extend_with_possible_array(original, el) {
  if (!(el instanceof Array)) {
    el = [el];
  }

  for (var i = 0; i < el.length; i++) {
    original.push(el[i]);
  }
}

function add_ex_to_groups(groups) {
  if (!(groups instanceof Array)) {
    return ["Ex-" + groups, "前" + groups];
  }

  var result = [];
  groups.forEach((group) => {
    add_ex_to_groups(group).forEach(exname => {
      result.push(exname);
    });
  });

  return result;
}

function create_search(properties) {
  var search = [];

  if ("name" in properties) {
    search.push(properties.name);
  }

  if ("name_kr" in properties) {
    search.push(properties.name_kr);
  }

  var roman_groups = [];
  var korean_groups = [];
  var roman_member_names = [];
  var korean_member_names = [];


  if ("group" in properties) {
    extend_with_possible_array(roman_groups, properties.group);
    extend_with_possible_array(roman_groups, add_ex_to_groups(properties.group));
  }

  if ("alt_groups_roman" in properties && properties.alt_groups_roman) {
    extend_with_possible_array(roman_groups, properties.alt_groups_roman);
    extend_with_possible_array(roman_groups, add_ex_to_groups(properties.alt_groups_roman));
  }

  if ("group_kr" in properties) {
    extend_with_possible_array(korean_groups, properties.group_kr);
    extend_with_possible_array(korean_groups, add_ex_to_groups(properties.group_kr));
  }

  if ("alt_groups" in properties && properties.alt_groups) {
    extend_with_possible_array(korean_groups, properties.alt_groups);
    extend_with_possible_array(korean_groups, add_ex_to_groups(properties.alt_groups));
  }

  if ("member_name" in properties) {
    extend_with_possible_array(roman_member_names, properties.member_name);
  }

  if ("member_name_kr" in properties) {
    extend_with_possible_array(korean_member_names, properties.member_name_kr);
  }

  if ("nicks" in properties && properties.nicks && properties.nicks instanceof Array) {
    for (var i = 0; i < properties.nicks.length; i++) {
      var nick = properties.nicks[i];

      if (nick.hangul) {
        korean_member_names.push(nick.hangul);
      }

      if (nick.roman) {
        extend_with_possible_array(roman_member_names, nick.roman);
      }
    }
  }

  if ("names" in properties && properties.names && properties.names instanceof Array) {
    for (var i = 0; i < properties.names.length; i++) {
      var name = properties.names[i];

      if (name.hangul) {
        korean_member_names.push(name.hangul);
      }

      if (name.roman) {
        extend_with_possible_array(roman_member_names, name.roman);
      }
    }
  }

  roman_groups.forEach(group => {
    roman_member_names.forEach(name => {
      search.push(group + " " + name);
    });
    korean_member_names.forEach(name => {
      search.push(group + " " + name);
    });
  });

  korean_groups.forEach(group => {
    korean_member_names.forEach(name => {
      search.push(group + " " + name);
    });
    roman_member_names.forEach(name => {
      search.push(group + " " + name);
    });
  });

  /*if ("member_name" in properties) {
    if ("group" in properties) {
      if (properties.group instanceof Array) {
        for (var i = 0; i < properties.group.length; i++) {
          search.push(properties.group[i] + " " + properties.member_name);
        }
      } else {
        search.push(properties.group + " " + properties.member_name);
      }
    }

    if ("alt_groups_roman" in properties && properties.alt_groups_roman) {
      var alt_groups = properties.alt_groups_roman;
      if (!(alt_groups instanceof Array)) {
        alt_groups = [alt_groups];
      }

      for (var i = 0; i < alt_groups.length; i++) {
        if (alt_groups[i]) {
          search.push(alt_groups[i] + " " + properties.member_name);
        }
      }
    }
  }

  if ("member_name_kr" in properties) {
    if ("group_kr" in properties) {
      search.push(properties.group_kr + " " + properties.member_name_kr);
    }

    if ("alt_groups" in properties && properties.alt_groups) {
      var alt_groups = properties.alt_groups;
      if (!(alt_groups instanceof Array)) {
        alt_groups = [alt_groups];
      }

      for (var i = 0; i < alt_groups.length; i++) {
        if (alt_groups[i]) {
          search.push(alt_groups[i] + " " + properties.member_name_kr);
        }
      }
    }
  }*/

  var newsearch = [];
  search.forEach(item => {
    upush(newsearch, strip_search(item));
  });

  return newsearch;
}

function getRandomArbitrary(min, max) {
  return (Math.random() * (max - min) + min) >> 0;
}

function create_id(db, key) {
  var id = sanitize_id(getRandomArbitrary(1, 10*1000*1000));
  console.log("Trying id ", id);

  var query = {};
  query[key] = id;

  return new Promise((resolve, reject) => {
    db.find(query).then(
      star => {
        if (star && star.length > 0) {
          create_id().then(
            id => {
              resolve(id);
            },
            err => {
              reject(err);
            }
          );
        } else {
          resolve(id);
        }
      },
      err => {
        reject(err);
      }
    );
  });
}

function create_star_id() {
  return create_id(db_stars, "star_id");
}

function create_account_id() {
  return create_id(db_accounts, "account_id");
}

function create_rule_id() {
  return create_id(db_rules, "rule_id");
}

function update_account(account, properties) {
  var changed = false;

  if (properties.username && account.username !== properties.username) {
    account.username = properties.username;
    changed = true;
  }

  if (properties.uid && account.uid !== properties.uid) {
    account.uid = properties.uid;
    changed = true;
  }

  return new Promise((resolve, reject) => {
    if (changed) {
      db_accounts.update(account._id, account).then(
        account => {
          resolve(account.result);
        },
        err => {
          reject(err);
        }
      );
    } else {
      resolve(account);
    }
  });
}

function update_star(star, properties) {
  var changed = false;

  var copyprop = [
    "group",
    "group_kr",
    "name",
    "name_kr",
    "member_name",
    "member_name_kr",
    "alt_groups",
    "alt_groups_roman",
    "noupload",
    "group_noupload"
  ];

  var newproperties = {};

  newproperties.search = create_search(properties);

  copyprop.forEach(prop => {
    if (prop in properties) {
      newproperties[prop] = properties[prop];
    }
  });

  for (var prop in newproperties) {
    if (!(prop in star)) {
      changed = true;
      star[prop] = newproperties[prop];
    } else if (JSON.stringify(star[prop]) !== JSON.stringify(newproperties[prop])) {
      changed = true;
      star[prop] = newproperties[prop];
    }
  }

  return new Promise((resolve, reject) => {
    if (!changed) {
      return resolve(star);
    }

    if (star._id) {
      db_stars.update(star._id, star).then(
        result => {
          resolve(star);
        },
        err => {
          reject(err);
        }
      );
    } else {
      db_stars.insert(star).then(
        result => {
          resolve(star);
        },
        err => {
          reject(err);
        }
      );
    }
  });
}

async function add_account(properties) {
  var star = await find_star(properties);

  if (star) {
    star = await update_star(star, properties);

    if (!properties.site && (!properties.uid || !properties.username))
      return star;

    var account = await find_account(properties);
    if (account) {
      var newaccount = await update_account(account, properties);
      return newaccount;
    }

    var id = await create_account_id();

    account = {
      site: properties.site,
      account_id: id,
      star_id: star.star_id,
      created_at: Date.now()
    };

    if (properties.uid) {
      account.uid = properties.uid;
    }

    if (properties.username) {
      account.username = properties.username;
    }

    var newaccount = await db_accounts.insert(account);
    return account;
  } else {
    var id = await create_star_id();

    star = {
      star_id: id,
      created_at: Date.now()
    };

    await update_star(star, properties);
    var account = await add_account(properties);
    return account;
  }
}

async function create_rule(options) {
  // {
  //   user: user_id -- dm
  //     or:
  //   guild: guild_id
  //   channel: channel_id
  //
  //   star_id: star_id
  //     or:
  //   account_id: account_id
  //     or:
  //   all: true
  //
  //   replays: bool
  //
  //   rule_id: rule_id
  // }

  var rule = await db_rules.find(options);
  if (rule && rule.length > 0)
    return [rule[0], false];

  if (!options.rule_id) {
    options.rule_id = await create_rule_id();
  }

  if (!options.created_at) {
    options.created_at = Date.now();
  }

  console.log(options);
  var rule = await db_rules.insert(options);
  return [options, true];
}

function remove_rule(rule_id, source) {
  console.log("Removing rule: " + rule_id + " (because of " + source + ")");
  return db_rules.remove({rule_id: sanitize_id(rule_id)}, {multi: false});
}

async function get_rules_for_account(account, replay) {
  orquery = [
    {star_id: sanitize_id(account.star_id)},
    {account_id: sanitize_id(account.account_id)},
    {all: true}
  ];

  orquery1 = [];

  if (!replay) {
    orquery1.push({replays: true});
    orquery1.push({replays: false});
  } else {
    orquery1.push({replays: true});
    orquery1.push({replays: "only"});
  }

  var query = {
    "$and": [
      {"$or": orquery},
      {"$or": orquery1}
    ]
  };

  var rules = await db_rules.find(query);

  return rules;
}

async function get_rules_for_user_account(userid, account) {
  var orquery = [];

  if (account.star_id) {
    orquery.push({star_id: sanitize_id(account.star_id)});
  }

  if (account.account_id) {
    orquery.push({account_id: sanitize_id(account.account_id)});
  }

  if (orquery.length === 0)
    return [];

  return await db_rules.find({
    "$or": orquery,
    user: sanitize_id(userid)
  });
}

function is_subscribed(userid, account) {
  if (!(userid in users))
    return false;

  if (users[userid].subbed_titles.indexOf(account.name) >= 0) {
    return true;
  }

  if (users[userid].subbed_accounts.indexOf(account.site + "/" + account.username) >= 0) {
    return true;
  }

  return false;
}

function get_subscribed_users(account) {
  var out = [];
  for (var user in users) {
    if (is_subscribed(user, account))
      out.push(user);
  }

  return out;
}

function base_rule(account, replays) {
  var options = {
    replays: replays
  };

  if (account === "*") {
    options.all = true;
  } else if (account.account_id) {
    options.account_id = account.account_id;
  } else if (account.star_id) {
    options.star_id = account.star_id;
  }

  return options;
}

function sanitize_id(id) {
  if (typeof id === "number")
    id = id + "";

  if (typeof id !== "string")
    throw "id is not a string";

  // in case someone wrote a channel name instead
  if (id.match(/^<!?[#@]([0-9]+)>$/))
    return id.replace(/^<!?[#@]([0-9]+)>$/, "$1");

  // underscores can be accidentally pressed and harder to see
  if (id.match(/^_*([0-9]+)_*$/))
    return id.replace(/^_*([0-9]+)_*$/, "$1");

  if (!id.match(/^\s*[0-9]+\s*$/))
    throw "id is not a number";

  return id.replace(/\s*/g, "");
}

function get_subscribe_name(lang, account) {
  var text = "undefined";

  if (account === "*")
    text = _(lang, "all_accounts");
  else if (lang === "en" && account.name)
    text = account.name;
  else if (lang === "kr" && account.name_kr)
    text = account.name_kr;
  else if (account.username)
    text = "@" + account.username;

  return text;
}

function subscribed_msg(was_subscribed, account, show_help) {
  var help_en = "";
  var help_kr = "";
  if (show_help) {
    help_en = _("en", "command_helpsuffix");
    help_kr = _("kr", "command_helpsuffix");
  }

  if (!was_subscribed) {
    return _("en", "subscribedto", get_subscribe_name("en", account)) + "\n" +
      _("kr", "subscribedto", get_subscribe_name("kr", account)) + "\n\n" +
      help_en + "\n" + help_kr;
  } else {
    return _("en", "alreadysubscribedto", get_subscribe_name("en", account)) + "\n" +
      _("kr", "alreadysubscribedto", get_subscribe_name("kr", account)) + "\n\n" +
      help_en + "\n" + help_kr;
  }
}

async function subscribe_user(userid, account, replays) {
  var options = base_rule(account, replays);
  options.user = userid;

  var output = await create_rule(options);

  if (output[1])
    //senddm(userid, "Subscribed to **" + get_subscribe_name(account) + "**" + dm_helptext);
    senddm(userid, subscribed_msg(false, account, true));
  else
    //senddm(userid, "Already subscribed to **" + get_subscribe_name(account) + "**" + dm_helptext);
    senddm(userid, subscribed_msg(true, account, true));
}

async function subscribe_channel(message, guild, channel_id, account, replays, pings) {
  var options = base_rule(account, replays);
  options.guild = guild;
  options.channel = channel_id;
  options.ping_roles = pings;

  var output = await create_rule(options);

  if (message) {
    if (output[1])
      //message.reply("Subscribed to **" + get_subscribe_name(account) + "**");
      message.reply(subscribed_msg(false, account, false));
    else
      //message.reply("Already subscribed to **" + get_subscribe_name(account) + "**");
      message.reply(subscribed_msg(true, account, false));
  }
}

function discord_invite_msg(lang, userid) {
  if (!bot_guild.members.get(userid)) {
    return _(lang, "discord_invite_msg", config.parsed.DISCORD_INVITE_LINK);
  }

  return "";
}

async function unsubscribe(message, ruleid) {
  try {
    var removed = await remove_rule(ruleid, "unsubscribe_func");
    if (message) {
      if (removed && removed.result.n > 0) {
        message.reply(_("en", "removed_rule", ruleid) + "\n" +
                      _("kr", "removed_rule", ruleid));
      } else {
        message.reply(_("en", "rule_not_found", ruleid) + "\n" +
                      _("kr", "rule_not_found", ruleid));
      }
    }
  } catch (e) {
    console.error(e);
    if (message) {
      message.reply("Unknown error removing rule **" + ruleid + "**");
    }
  }
}

async function reset_activity() {
  //await client.user.setPresence({game: null});
  client.user.setActivity(null);
  //client.user.setPresence({game: {name: " ", type: 0}});
}

client.on('ready', async () => {
  try {
    await reset_activity();
  } catch (e) {
    console.error("Unable to reset client activity", e);
  }

  self_userid = client.user.id;
  bot_guild = client.guilds.get(config.parsed.DISCORD_GUILD_ID);
  if (!bot_guild) {
    console.log("Bot guild is missing?");
  }

  console.log("Discord ready");
});

client.on('error', (err) => {
  console.error(err);
});

async function check_accepted_guild(guild) {
  if (guild.id === config.parsed.DISCORD_GUILD_ID)
    return true;

  var guild_ok = await db_guilds.find({
    guild_id: guild.id,
    ok: true
  });

  if (!guild_ok || guild_ok.length === 0) {
    console.log("Guild " + guild.id + " is not whitelisted, leaving");
    guild.leave();
    return false;
  }

  return true;
}

client.on('guildCreate', guild => {
  check_accepted_guild(guild);
});

client.on('message', async message => {
  if (!message || !message.content ||
      message.author.id === self_userid ||
      message.author.bot)
    return;

  var msg = message.content
      .replace(/^\s*/, "")
      .replace(/\s*$/, "");

  if (!msg)
    return;

  if (message.channel.type !== "dm" &&
      !msg.startsWith("<@" + self_userid + ">") &&
      !msg.startsWith("<@!" + self_userid + ">") &&
      !msg.toLowerCase().startsWith("!livebot"))
    return;

  if (message.channel.type !== "dm" &&
      !message.member.roles.find("name", "LiveBotAdmin")) {
    if (!message.guild) {
      console.log("Not in a guild " + message.author.id + " '" + message.content + "' " + message.channel.type);
      message.reply("Not in a guild? You shouldn't see this");
      return;
    }

    if (message.author.id !== message.guild.ownerID) {
      //message.reply("You need the `LiveBotAdmin` role to modify the bot's settings for the guild");
      message.reply(_("both", "livebotadmin_needed"));
      return;
    }
  }

  var is_user = message.channel.type === "dm";

  var newmsg = msg.replace(/^(?:<@[^>]*[0-9]+>|!LiveBot)\s+/i, "");
  if (newmsg === msg && false) {
    console.log("Error processing message: " + msg);
    return;
  }
  msg = newmsg;

  console.log(message.author.id, msg);

  var newmsg = msg
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");
  var args = [];
  var quote = null;
  for (var i = 0; i < 1000; i++) {
    if (!newmsg)
      break;

    if (newmsg[0] === '"' ||
        newmsg[0] === "'")
      quote = newmsg[0];
    else
      quote = null;

    var match;
    if (!quote)
      match = newmsg.match(/^([\S]*)\s*([\s\S]*)$/);
    else {
      var regex = new RegExp("^" + quote + "(.*?)" + quote + "\\s*([\\s\\S]*)$");
      match = newmsg.match(regex);
      if (!match) {
        //message.reply("Unterminated quote?");
        message.reply(_("both", "unterminated_quote"));
        return;
      }
    }

    args.push(match[1]);

    newmsg = match[2];
  }

  console.log(args);
  var command = args[0].toLowerCase();

  var youre = is_user ? "you are" : "your guild is";
  var replays_help = [
    "The `with_replays` argument determines whether or not replays are included. Possible values:",
    "",
    "    * `true`  - Subscribes to both livestreams and replays",
    "    * `false` - Only subscribes to livestreams",
    "    * `only`  - Only subscribes to replays"
  ].join("\n");

  var commands = {
    "help": {
      command: "help_command",
      emoji: "❓",
      shorthelp: "help_shorthelp",
      longhelp: "help_longhelp"
    },
    "list": {
      command: "list_command",
      emoji: "📝",
      shorthelp: is_user ? "list_you_help" : "list_server_help"
    },
    "subscribe": {
      command: "subscribe_command",
      emoji: subscribe_emoji,
      sample_args: "subscribe_you_args",
      shorthelp: "subscribe_you_shorthelp",
      longhelp: "subscribe_you_longhelp"
    },
    "unsubscribe": {
      command: "unsubscribe_command",
      emoji: unsubscribe_emoji,
      sample_args: "unsubscribe_args",
      shorthelp: "unsubscribe_shorthelp",
      longhelp: "unsubscribe_longhelp"
    }
  };

  if (!is_user) {
    commands.subscribe.sample_args = "subscribe_guild_args";
    commands.subscribe.shorthelp = "subscribe_guild_shorthelp";
    commands.subscribe.longhelp = "subscribe_guild_longhelp";
  }

  var kr_command = false;
  var lang = "en";
  var orig_command = command;
  command = "invalid";
  if (orig_command === "role")
    command = "role";
  for (var cmd in commands) {
    if (orig_command === _("en", commands[cmd].command)) {
      command = cmd;
      break;
    } else if (orig_command === _("kr", commands[cmd].command)) {
      kr_command = true;
      lang = "kr";
      command = cmd;
      break;
    }
  }

  switch (command) {
  case "help":
    var reply = "*" + _(lang, "help_kr_header") + "*\n\n" + _(lang, "commands_available");

    for (var cmd in commands) {
      var text = "";

      var ccmd = commands[cmd];
      if (ccmd.emoji)
        text += ccmd.emoji + " ";

      text += "`" + _(lang, ccmd.command);

      if (ccmd.sample_args)
        text += " " + _(lang, ccmd.sample_args);

      text += "`";

      if (ccmd.shorthelp)
        text += " - " + _(lang, ccmd.shorthelp);

      text += "\n\n";

      if (ccmd.longhelp)
        text += _(lang, ccmd.longhelp) + "\n\n";

      text = text.replace(/\s*$/, "") + "\n\n\n";

      reply += text;
    }

    reply += discord_invite_msg("en", message.author.id);

    message.reply(reply);
    break;
  case "subscribe":
    arglength = is_user ? 3 : 4;
    if (args.length < arglength) {
      //return message.reply("Needs at least " + arglength + " arguments (use the `help` command for more information)");
      return message.reply(_(lang, "at_least_n_arguments", arglength));
    }

    var star_search = is_user ? args[1] : args[2];
    var replays = is_user ? args[2] : args[3];

    if (replays !== "true" &&
        replays !== "false" &&
        replays !== "only") {
      //var memberhelp = " (use the `help` command for more information)";
      var memberhelp = _(lang, "help_for_more_info_upper");
      if (typeof star_search === "string" && star_search.indexOf(" ") < 0) {
        //memberhelp = " (did you forget to add quotes around the member name? Use the `help` command for examples)";
        memberhelp = _(lang, "forget_quotes");
      }

      //return message.reply("The `with_replays` argument needs to be one of `true`, `false`, or `only`" + memberhelp);
      return message.reply(
        _(lang, "invalid_with_replays") + " " + memberhelp + "\n\n" + _(lang, "replays_help")
      );
    }

    if (replays === "true")
      replays = true;
    else if (replays === "false")
      replays = false;

    var channel_id = null;
    if (!is_user) {
      var ok = false;
      try {
        channel_id = sanitize_id(args[1]);
        if (channel_id)
          ok = true;
      } catch (e) {
      }

      if (!ok) {
        //return message.reply("Invalid `channel_id` (make sure you copied the ID, not the name of the channel)");
        return message.reply(_(lang, "invalid_channel_id"));
      }

      if (!message.guild) {
        return message.reply("Not in a guild? You shouldn't see this");
      }

      if (!message.guild.channels.get(channel_id)) {
        //return message.reply("Channel ID '" + channel_id + "' does not exist, or is not accessible by the bot");
        return message.reply(_(lang, "channel_id_not_exist"));
      }
    }

    var pings = [];
    if (!is_user) {
      if (args.length > 4 && args[4]) {
        var ok = false;
        var ping = null;
        try {
          ping = sanitize_id(args[4]);
          if (ping)
            ok = true;
        } catch (e) {}

        if (!ok) {
          //return message.reply("Invalid `role_id`");
          return message.reply(_(lang, "invalid_role_id"));
        }

        if (!message.guild) {
          return message.reply("Not in a guild? You shouldn't see this");
        }

        if (!message.guild.roles.get(ping)) {
          //return message.reply("Role ID '" + ping + "' does not exist");
          return message.reply(_(lang, "role_does_not_exist"));
        }

        pings.push(ping);
      }
    }

    var star;
    if (star_search === "*") {
      star = star_search;
    } else {
      star = await find_star({search: star_search});
      if (!star) {
        star = await find_star({username: star_search, site: "instagram"});
        if (!star) {
          //var text = "Unable to find `" + star_search + "`.\n\nThe account may be in the database, but is not currently accessible to the bot. Use the `#account-suggestions` channel in the LiveBot server to request a new account.";
          var text = _(lang, "unable_to_find_account", star_search);

          var invite_msg = discord_invite_msg(lang, message.author.id);
          if (invite_msg)
            text += "\n\n" + invite_msg;

          return message.reply(text);
        }
      }
    }

    if (is_user) {
      subscribe_user(message.author.id, star, replays);
    } else {
      subscribe_channel(message, message.guild.id, channel_id, star, replays, pings);
    }
    break;
  case "unsubscribe":
    if (args.length < 2) {
      //return message.reply ("Needs `rule_id` (use the `list` command to find rules you are subscribed to)");
      return message.reply(_(lang, "needs_rule_id"));
    }

    var rule_id = args[1];
    var ok = false;
    try {
      rule_id = sanitize_id(rule_id);
      if (rule_id)
        ok = true;
    } catch(e) {
    }

    if (!ok) {
      //return message.reply("Invalid `rule_id` (this should be a number, you can find subscribed rules using the `list` command)");
      return message.reply(_(lang, "invalid_rule_id"));
    }

    var query = {rule_id: rule_id};

    if (is_user) {
      query.user = message.author.id;
    } else {
      query.guild = message.guild.id;
    }

    var rule = await db_rules.find(query);
    if (!rule || rule.length === 0) {
      //return message.reply("Rule " + rule_id + " does not exist");
      return message.reply(_(lang, "rule_does_not_exist", rule_id));
    }

    unsubscribe(message, rule_id);
    break;
  case "list":
    var rules = [];

    if (is_user) {
      rules = await db_rules.find({user: message.author.id});
    } else {
      rules = await db_rules.find({guild: message.guild.id});
    }

    if (!rules || rules.length === 0) {
      return message.reply(_(lang, "no_rules_found"));
    }

    var message_text = "**" + _(lang, "rules") + "**\n\n";

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var text = "`" + rule.rule_id + "` ";

      var account_name = "";

      if (rule.all) {
        account_name = _(lang, "all_accounts");
      } else if (rule.star_id) {
        var star = await find_star_by_id(rule.star_id);
        if (!star) {
          account_name = "undefined";
        } else {
          if (lang === "en")
            account_name = star.name;
          else if (lang === "kr")
            account_name = star.name_kr;
        }
      } else if (rule.account_id) {
        var accounts = await db_accounts.find({account_id: rule.account_id});
        if (!accounts || accounts.length === 0) {
          account_name = "undefined";
        } else {
          account_name = "@" + account.username;
        }
      }

      if (is_user) {
        text += "**" + account_name + "**";
      } else  {
        var channel_name = "";
        var guild = client.guilds.get(rule.guild);
        var ping_text = "";
        if (!guild) {
          channel_name = "undefined guild";
        } else {
          var channel = guild.channels.get(rule.channel);
          if (!channel) {
            channel_name = "undefined channel";
          } else {
            channel_name = channel.name;
          }

          if (rule.ping_roles && rule.ping_roles.length > 0) {
            ping_text += ", ";
            var pingroles = [];
            for (var j = 0; j < rule.ping_roles.length; j++) {
              var role = guild.roles.get(rule.ping_roles[j]);
              var rolename = "undefined-role";
              if (role) {
                rolename = role.name;
              }
              pingroles.push("`@" + rolename + "`");
            }

            ping_text += _(lang, "list_pings_role", pingroles.join(", "));
          }
        }

        //text += " on `#" + channel_name + "`" + ping_text;
        text += _(lang, "list_account_on_channel", account_name, channel_name);
        text += ping_text;
      }

      if (rule.replays === true) {
        text += " (" + _(lang, "with_replays") + ")";
      } else if (rule.replays === "only") {
        text += " (" + _(lang, "only_replays") + ")";
      } else if (rule.replays === false) {
        text += " (" + _(lang, "no_replays") + ")";
      }

      message_text += text + "\n";
    }

    message.reply(message_text);
    break;
  case "role":
    if (is_user || !message.guild) {
      message.reply("Not in guild");
      break;
    }

    if (args.length < 2) {
      message.reply("Need role name");
      break;
    }

    var reply_text = "";
    message.guild.roles.forEach((role) => {
      if (role.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, "") ===
          args[1].toLowerCase().replace(/[^a-zA-Z0-9]/g, "")) {
        reply_text += role.name + " " + role.id;
      }
    });

    if (!reply_text) {
      message.reply("No role found");
      break;
    }

    message.reply(reply_text);
    break;
  default:
    //message.reply("Unknown command (use the `help` command for more information)");
    message.reply(_("both", "unknown_command"));
    break;
  }
});

// TODO: use proper API
client.on('raw', async function(event) {
  if (!event || !event.t || !event.d)
    return;

  if (event.t === 'MESSAGE_REACTION_ADD') {
    if (event.d.user_id === self_userid) {
      return;
    }

    var event_user_id = sanitize_id(event.d.user_id);

    var user = client.users.get(event_user_id);
    var channel = client.channels.get(event.d.channel_id) || await user.createDM();
    /*if (event.d.channel_id !== lives_channel_id) {
      return;
    }*/

    channel.fetchMessage(event.d.message_id).then(
      async message => {
        if (message.author.id !== self_userid) {
          return;
        } else {
          var emoji = event.d.emoji.name;

          if (emoji !== subscribe_emoji &&
              emoji !== unsubscribe_emoji)
            return;

          var sent_message = await get_sent_message(event.d.message_id);

          if (sent_message.type !== "live" &&
              sent_message.type !== "replay")
            return;

          var account = await find_account_by_id(sent_message.account);
          if (!account)
            return;

          var star = await find_star_by_id(account.star_id);
          if (!star)
            return;

          //console.log(account);
          if (event.d.emoji.name === subscribe_emoji) {
            if (sent_message.type === "live")
              subscribe_user(event_user_id, star, false);
            else if (sent_message.type === "replay")
              subscribe_user(event_user_id, star, "only");
            //console.log("sub");
          } else if (event.d.emoji.name === unsubscribe_emoji) {
            var rules = await get_rules_for_user_account(event_user_id, account);
            if (rules && rules.length > 0) {
              rules.forEach(rule => {
                if (sent_message.type === "live") {
                  if (rule.replays === true || rule.replays === false)
                    remove_rule(rule.rule_id, "emoji");
                } else if (sent_message.type === "replay") {
                  if (rule.replays === true || rule.replays === "only")
                    remove_rule(rule.rule_id, "emoji");
                }
              });
              var name_en = star.name;
              var name_kr = star.name_kr;
              var type_en = "";
              var type_kr = "";
              if (sent_message.type === "live") {
                type_en = _("en", "lives");
                type_kr = _("kr", "lives");
              } else if (sent_message.type === "replay") {
                type_en = _("en", "replays");
                type_kr = _("kr", "replays");
              }

              senddm(event_user_id,
                     _("en", "unsubscribed_from", name_en, type_en) + "\n" +
                     _("kr", "unsubscribed_from", name_kr, type_kr));
              //senddm(event_user_id, "Unsubscribed from **" + star.name + "**'s " + sent_message.type + "s");
            } else {
              //senddm(event_user_id, "Nothing to unsubscribe from");
              senddm(event_user_id, _("both", "nothing_to_unsubscribe"));
            }
            //console.log("unsub");
          }
        }
        //console.log(message);
      },
      () => {
        console.error("Unable to fetch message: " + event.d.message_id);
      }
    );
  }
});

var clear_activity_timeout = null;
var clear_activity_time = 60*1000;
var current_watching = [];
var current_watching_id = 0;
var current_watching_change_date = 0;
var current_watching_change_time = 20*1000;
async function clear_status(guid) {
  try {
    var id = -1;
    for (var i = 0; i < current_watching.length; i++) {
      if (current_watching[i].broadcast_guid === guid) {
        id = i;
        break;
      }
    }

    if (id >= 0) {
      if (current_watching[id].clear_timeout) {
        clearTimeout(current_watching[id].clear_timeout);
        current_watching[id].clear_timeout = null;
      }

      current_watching.splice(id, 1);

      if (current_watching_id === id) {
        current_watching_id++;
        current_watching_id = current_watching_id % current_watching.length;
        current_watching_change_date = Date.now() + current_watching_change_time;
      } else if (current_watching_id > id) {
        current_watching_id--;
      }
    }

    if (current_watching.length <= 0) {
      //await client.user.setActivity(null);
      await reset_activity();
    }

    /*if (clear_activity_timeout) {
      clearTimeout(clear_activity_timeout);
      clear_activity_timeout = null;
    }

    if (current_watching) {
      current_watching = null;
    }*/
  } catch (e) {
    console.error("Error clearing activity: ", e);
  }
}

async function set_status(body) {
  if (!body || body.type !== "live" || !body.broadcast_guid)
    return;

  /*if (current_watching && current_watching.date && body.date && body.date < current_watching.date)
    return;*/

  var id = -1;
  for (var i = 0; i < current_watching.length; i++) {
    if (current_watching[i].broadcast_guid === body.broadcast_guid) {
      id = i;
      break;
    }
  }

  if (id < 0) {
    id = current_watching.length;
    current_watching.push(body);
  }

  if (current_watching[id].clear_timeout) {
    clearTimeout(current_watching[id].clear_timeout);
  }

  current_watching[id].clear_timeout = setTimeout(
      function() {
        clear_status(body.broadcast_guid);
      },
    clear_activity_time);

  /*if (clear_activity_timeout) {
    clearTimeout(clear_activity_timeout);
    clear_activity_timeout = null;
    }*/

  if (Date.now() > current_watching_change_date) {
    current_watching_id++;
    current_watching_change_date = Date.now() + current_watching_change_time;
  }

  current_watching_id = current_watching_id % current_watching.length;

  try {
    var current = current_watching[current_watching_id];
    var status = current.name;
    if (current.site && current.site in short_sites)
      status += " | " + short_sites[current.site];

    await client.user.setActivity(status, { type: 'WATCHING' });

    //current_watching = body;
    //clear_activity_timeout = setTimeout(clear_status, clear_activity_time);
  } catch (e) {
    console.error(e);
  }
}

async function send_message(body) {
  var sitename = "";
  switch (body.site) {
  case "instagram":
    sitename = "instagram";
    break;
  case "periscope":
    sitename = "periscope";
    break;
  case "youtube":
    sitename = "youtube";
    break;
  case "afreecatv":
    sitename = "afreecatv";
    break;
  case "goldlive":
    sitename = "goldlive";
    break;
  }

  if (body.type === "live" ||
      body.type === "replay") {
    var noupload_msg_en = "";
    var noupload_msg_kr = "";
    if (true && body.site === "instagram") {
      if (body.noupload || (body.group_noupload && body.noupload !== false)) {
        //noupload_msg = " *(will likely not be uploaded)*";
        noupload_msg_en = " *(" + _("en", "noupload") + ")*";
        noupload_msg_kr = " *(" + _("kr", "noupload") + ")*";
      }
    }

    var message_text, message_text, subscribe_msg, unsubscribe_msg;

    if (body.type === "live") {
      //message_text = "**" + body.name + "** is live on " + sitename + noupload_msg + "\n" + body.watch_link + "\n\n";
      var message_text_en = _("en", "is_live_on", body.name, _("en", sitename)) + noupload_msg_en;
      var message_text_kr = _("kr", "is_live_on", body.name_kr, _("kr", sitename)) + noupload_msg_kr;
      message_text = message_text_en + "\n" + message_text_kr + "\n\n" + body.watch_link + "\n\n";

      //subscribe_msg = "*Use " + subscribe_emoji + " to subscribe to future lives by this person*";
      subscribe_msg =
        _("en", "emoji_subscribe", _("en", "lives")) + "\n" +
        _("kr", "emoji_subscribe", _("kr", "lives"));
      //unsubscribe_msg = "*Use " + unsubscribe_emoji + " to unsubscribe from future lives by this person*";
      unsubscribe_msg =
        _("en", "emoji_unsubscribe", _("en", "lives")) + "\n" +
        _("kr", "emoji_unsubscribe", _("kr", "lives"));
    } else if (body.type === "replay") {
      //message_text = "Replay of **" + body.name + "**'s " + sitename + " livestream\n\n" + body.broadcast_guid + "\n\n";
      var message_text_en = _("en", "replay_of", body.name, _("en", sitename));
      var message_text_kr = _("kr", "replay_of", body.name_kr, _("kr", sitename));
      message_text = message_text_en + "\n" + message_text_kr + "\n\n" + body.broadcast_guid + "\n\n";

      //subscribe_msg = "*Use " + subscribe_emoji + " to subscribe to future replays by this person*";
      //unsubscribe_msg = "*Use " + unsubscribe_emoji + " to unsubscribe to future replays by this person*";
      subscribe_msg =
        _("en", "emoji_subscribe", _("en", "replays")) + "\n" +
        _("kr", "emoji_subscribe", _("kr", "replays"));
      unsubscribe_msg =
        _("en", "emoji_unsubscribe", _("en", "replays")) + "\n" +
        _("kr", "emoji_unsubscribe", _("kr", "replays"));
    }

    var account = await find_account(body);
    var rules = await get_rules_for_account(account, body.type === "replay");

    try {
      set_status(body);
    } catch (e) {
      console.error(e);
    }

    rules.forEach(async rule => {
      if (rule.created_at > body.date) {
        //console.log((rule.created_at - body.date) / 1000);
        return;
      }

      var this_text = message_text;

      if (rule.ping_roles && rule.ping_roles.length > 0) {
        var ping_text = "";
        for (var i = 0; i < rule.ping_roles.length; i++) {
          ping_text += "<@&" + rule.ping_roles[i] + "> ";
        }

        this_text = ping_text + this_text;
      }

      var properties = {
        type: body.type,
        account: account.account_id,
        star: account.star_id,
        site: body.site,
        broadcast_guid: body.broadcast_guid
      };

      var query = {
        type: body.type,
        site: body.site,
        broadcast_guid: body.broadcast_guid
      };

      if (rule.user) {
        query.user = rule.user;
        var already_messaged = await db_messages.find(query);
        if (already_messaged && already_messaged.length > 0) {
          return;
        }

        console.log("Notifying user " + rule.user + " of " + body.type + ": " + body.name + " (" + body.broadcast_guid + ")");

        var message = await senddm(rule.user, this_text + unsubscribe_msg, properties);
        message.react(unsubscribe_emoji);
      } else if (rule.guild && rule.channel) {
        query.guild = rule.guild;
        query.channel = rule.channel;
        var already_messaged = await db_messages.find(query);
        if (already_messaged && already_messaged.length > 0) {
          return;
        }

        console.log("Notifying channel " + rule.channel + " of " + body.type + ": " + body.name + " (" + body.broadcast_guid + ")");

        var message = await send_channel(rule.guild, rule.channel, this_text + subscribe_msg, properties);
        await message.react(subscribe_emoji);
        //await message.react(unsubscribe_emoji);
      }
    });
    return;
    lives_channel.send(message).then(
      async (message) => {
        await message.react(subscribe_emoji);
        await message.react(unsubscribe_emoji);
      },
      () => {
        console.error("Unable to send message");
      }
    );

    var users = get_subscribed_users(body);
    users.forEach(user => {
      senddm(user, message).then(
        message => {
          message.react(unsubscribe_emoji);
        },
        () => {
        }
      );
    });
  }
};

fastify.post('/add', (request, reply) => {
  try {

    //console.log(request.body);
    add_account(request.body).then(
      account => {
        if (request.body.type !== "account") {
          send_message(request.body);
        }
      }
    );

    reply.send({status: "ok"});
  } catch (err) {
    console.error(err);
    reply.send({status: "not_ok"});
  }
});

async function do_guild_white_blacklist(body) {
  if (!body || !body.guild_id || !body.type) {
    return;
  }

  if (body.type !== "whitelist" &&
      body.type !== "blacklist")
    return;

  var ok = body.type === "whitelist";

  var newobj = {
    ok
  };

  if (!ok) {
    newobj.reason = "admin_blacklist";
  } else {
    newobj.reason = "admin_whitelist";
  }

  var guilds = await db_guilds.find({guild_id: body.guild_id});
  //console.log(guilds);
  if (!guilds || guilds.length === 0) {
    var obj = {
      guild_id: body.guild_id
    };

    for (var prop in newobj) {
      obj[prop] = newobj[prop];
    }

    console.log("Inserting guild rule", obj);
    return db_guilds.insert(obj);
  } else {
    guilds.forEach(guild => {
      for (var prop in newobj) {
        guild[prop] = newobj[prop];
      }

      console.log("Updating guild rule", guild);
      db_guilds.update(guild._id, guild);
    });
  }
}

fastify.post('/guild', (request, reply) => {
  try {
    do_guild_white_blacklist(request.body);
    reply.send({status: "ok"});
  } catch (err) {
    console.error(err);
    reply.send({status: "not_ok"});
  }
});

async function do_delete(body) {
  if (!body || !body.type)
    return;

  if (body.type !== "message" || !body.message_type)
    return;

  if (!body.broadcast_guid)
    return;

  var messages = await db_messages.find({
    type: body.message_type,
    broadcast_guid: body.broadcast_guid
  });

  if (!body.confirm) {
    console.log(messages);
  } else {
    for (var i = 0; i < messages.length; i++) {
      var message = messages[i];

      try {
        var dmessage = null;

        if (message.guild) {
          var guild = client.guilds.get(message.guild);
          var channel = guild.channels.get(message.channel);
          dmessage = await channel.fetchMessage(message.messageid);
        } else if (message.user) {
          var user = await client.fetchUser(message.user);
          var channel = await user.createDM();
          dmessage = await channel.fetchMessage(message.messageid);
        }

        await dmessage.delete();
        console.log("Deleted " + message.messageid);
      } catch (err) {
        console.error(err);
        console.log("Failed to delete message:", message);
      }
    }
  }
}

fastify.post('/delete', (request, reply) => {
  try {
    do_delete(request.body);
    reply.send({status: "ok"});
  } catch (err) {
    console.error(err);
    reply.send({status: "not_ok"});
  }
});

fastify.listen(8456, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  console.log(`server listening on ${fastify.server.address().port}`);
});

client.login(config.parsed.DISCORD_TOKEN);
