<template>
  <q-page class="player-page flex flex-center">
    <div v-if="loading" class="flex flex-center" style="min-height: 90vh">
      <q-spinner-gears size="60px" color="primary" />
    </div>
    <q-card
      v-else
      class="player-card shadow-4 q-pa-md q-pa-lg-md relative-position flex column"
      bordered
    >
      <template v-if="!loading">
        <q-card-section class="text-center q-pb-md">
          <q-avatar size="100px" class="shadow-3 q-mb-md relative-position">
            <img v-if="avatarUrl" :src="avatarUrl" alt="Player Avatar" />
            <q-icon v-else name="person" size="60px" color="grey-5" />
            <q-badge
              v-if="currentUserId"
              floating
              color="primary"
              class="cursor-pointer"
              @click="triggerAvatarUpload"
            >
              <q-icon name="photo_camera" size="14px" />
            </q-badge>
            <input
              ref="avatarInput"
              type="file"
              accept="image/*"
              style="display: none"
              @change="onAvatarSelected"
            />
          </q-avatar>

          <div
            class="text-h4 text-weight-bolder text-primary brand-title q-mb-none"
          >
            {{ firstName }}
          </div>

          <div class="text-subtitle1 text-grey-7 q-mb-none">
            @{{ username }}
          </div>

          <div
            class="column items-center"
            style="width: 180px; gap: 8px; margin: 0 auto"
          >
            <q-btn
              v-if="PlayerProfile.state.duprId"
              color="primary"
              icon="verified"
              :label="`DUPR ID: ${PlayerProfile.state.duprId}`"
              size="sm"
              dense
              rounded
              class="full-width"
              style="border-radius: 12px"
            />

            <q-btn
              color="accent"
              icon="emoji_events"
              label="Leaderboard"
              size="sm"
              dense
              rounded
              class="full-width"
              style="border-radius: 12px"
              @click="showLeaderboardDialog = true"
            />

            <div
              class="rating-badge cursor-pointer"
              :style="{
                background: getRatingGradient(ratingColor),
                width: '100%',
                display: 'flex',
              }"
              @click="showHistoryDialog = true"
            >
              <div class="column items-center">
                <span class="text-h4 text-weight-bold text-white">{{
                  playerRating
                }}</span>
                <span class="text-caption text-white">{{
                  ratingCategory
                }}</span>
              </div>
            </div>
          </div>
        </q-card-section>

        <q-card-section class="q-px-lg q-mt-sm">
          <div
            class="text-subtitle1 text-weight-medium q-mb-sm text-center text-grey-8"
          >
            Join a Club
          </div>
          <div class="row q-col-gutter-sm items-center justify-center">
            <div class="col-8 col-md-9">
              <q-select
                filled
                v-model="clubId"
                :options="clubOptions"
                option-value="clubId"
                option-label="clubId"
                emit-value
                map-options
                use-input
                hide-selected
                fill-input
                input-debounce="300"
                label="Enter Club ID"
                dense
                color="primary"
                behavior="menu"
                menu-anchor="top middle"
                menu-self="bottom middle"
                hide-bottom-space
                @filter="filterClubs"
                @keyup.enter="joinClub"
              >
                <template #option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section>
                      <q-item-label>{{ scope.opt.name }}</q-item-label>
                      <q-item-label caption class="text-grey-7">{{
                        scope.opt.clubId
                      }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>
            <div class="col-4 col-md-3">
              <q-btn
                color="primary"
                label="Join"
                @click="joinClub"
                :disable="!clubId"
                class="full-width join-btn"
                dense
              />
            </div>
          </div>
          <div class="text-center q-mt-sm">
            <q-btn
              flat
              color="accent"
              size="sm"
              icon="add_circle"
              label="Create New Club"
              @click="showCreateClubDialog = true"
            />
          </div>
        </q-card-section>

        <div style="flex-grow: 1"></div>

        <q-card-actions align="center" class="q-mt-sm q-gutter-sm">
          <q-btn
            outline
            color="primary"
            label="Edit Profile"
            icon="edit"
            rounded
            class="edit-btn"
            @click="showEditProfileDialog = true"
          />
          <q-btn
            unelevated
            color="negative"
            label="Logout"
            icon="logout"
            rounded
            @click="onLogout"
          />
        </q-card-actions>

        <!-- Create Club Dialog -->
        <q-dialog v-model="showCreateClubDialog" persistent>
          <q-card style="min-width: 320px; max-width: 90vw">
            <q-card-section class="row items-center q-pb-none">
              <div class="text-h6">Create Club</div>
              <q-space />
              <q-btn icon="close" flat round dense v-close-popup>
                <q-tooltip
                  anchor="top middle"
                  self="bottom middle"
                  :offset="[8, 8]"
                  >Close</q-tooltip
                >
              </q-btn>
            </q-card-section>

            <q-card-section class="q-pt-md">
              <q-input
                v-model="newClubId"
                filled
                label="Club ID (unique URL slug)"
                dense
                class="q-mb-sm"
                :rules="[(val) => !!val?.trim() || 'Club ID is required']"
                hint="e.g. san-fabian-dinkers"
              />
              <q-input
                v-model="newClubName"
                filled
                label="Club Name"
                dense
                :rules="[(val) => !!val?.trim() || 'Club name is required']"
              />
            </q-card-section>

            <q-card-actions align="right">
              <q-btn flat label="Cancel" color="primary" v-close-popup />
              <q-btn
                flat
                label="Request"
                color="primary"
                :loading="createClubLoading"
                :disable="!newClubId?.trim() || !newClubName?.trim()"
                @click="createClub"
              />
            </q-card-actions>
          </q-card>
        </q-dialog>

        <!-- Player Stats Dialog -->
        <q-dialog v-model="showHistoryDialog">
          <q-card style="width: 480px; max-width: 90vw; max-height: 80vh">
            <q-card-section class="row items-center q-pb-none">
              <div class="text-h6">Player Stats</div>
              <q-space />
              <q-btn icon="close" flat round dense v-close-popup>
                <q-tooltip
                  anchor="top middle"
                  self="bottom middle"
                  :offset="[8, 8]"
                  >Close</q-tooltip
                >
              </q-btn>
            </q-card-section>

            <div class="q-px-md q-pt-md">
              <q-btn-toggle
                v-model="activeTab"
                :options="[
                  {
                    label: 'Rating',
                    value: 'history',
                    icon: 'trending_up',
                  },
                  { label: 'Matches', value: 'matches', icon: 'sports_tennis' },
                  { label: 'Partners', value: 'partners', icon: 'groups' },
                  { label: 'Rivals', value: 'rivals', icon: 'sports_kabaddi' },
                  { label: 'Clutch', value: 'clutch', icon: 'bolt' },
                ]"
                color="grey-5"
                toggle-color="accent"
                spread
                dense
                size="sm"
                class="full-width"
              />
            </div>

            <div
              v-if="activeTab === 'history'"
              class="q-pa-md"
              style="max-height: 60vh; overflow-y: auto"
            >
              <div v-if="ratingVelocity" class="row q-col-gutter-sm q-mb-md">
                <div class="col-6">
                  <q-card flat bordered class="text-center q-pa-sm">
                    <div class="text-h6 text-weight-bold">
                      {{ ratingVelocity.current }}
                    </div>
                    <div class="text-caption text-grey-8">Current Rating</div>
                  </q-card>
                </div>
                <div class="col-6">
                  <q-card flat bordered class="text-center q-pa-sm">
                    <div
                      class="text-h6 text-weight-bold"
                      :class="
                        ratingVelocity.change >= 0
                          ? 'text-positive'
                          : 'text-negative'
                      "
                    >
                      {{ ratingVelocity.change >= 0 ? '+' : ''
                      }}{{ ratingVelocity.change }}
                    </div>
                    <div class="text-caption text-grey-8">Rating Change</div>
                  </q-card>
                </div>
              </div>
              <div
                ref="chartRef"
                class="chart-container"
                v-if="sortedEvents.length"
              ></div>
              <q-list separator v-if="sortedEvents.length">
                <q-item
                  v-for="event in sortedEvents"
                  :key="event.day"
                  class="q-px-sm"
                >
                  <q-item-section>
                    <q-item-label caption class="text-grey">{{
                      event.day
                    }}</q-item-label>
                    <q-item-label class="text-weight-medium">
                      <span class="text-positive">{{ event.wins }}W</span>
                      <span class="text-grey"> / </span>
                      <span class="text-negative">{{ event.losses }}L</span>
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-chip
                      class="history-rating text-weight-bold"
                      text-color="white"
                      size="md"
                    >
                      {{ event.rating }}
                    </q-chip>
                  </q-item-section>
                </q-item>
              </q-list>
              <div v-else class="text-center text-grey q-py-md">
                No rating history available.
              </div>
            </div>

            <div
              v-else-if="activeTab === 'matches'"
              class="q-pa-md"
              style="max-height: 60vh; overflow-y: auto"
            >
              <div
                ref="matchesChartRef"
                class="chart-container"
                v-if="matchChartData.length"
              ></div>
              <q-list separator v-if="sortedMatches.length">
                <q-item
                  v-for="match in sortedMatches"
                  :key="match.match_key"
                  :class="['q-px-sm', getMatchRowClass(match)]"
                >
                  <q-item-section>
                    <MatchResult
                      :teamA="match.team_a"
                      :teamB="match.team_b"
                      :teamAScore="match.team_a_score"
                      :teamBScore="match.team_b_score"
                      :completedAt="match.completed_at"
                    />
                  </q-item-section>
                </q-item>
              </q-list>
              <div v-else class="text-center text-grey q-py-md">
                No completed matches available.
              </div>
            </div>

            <div
              v-else-if="activeTab === 'partners'"
              class="q-pa-md"
              style="max-height: 60vh; overflow-y: auto"
            >
              <PayBanner
                v-if="isPaymentExpired"
                :loading="paymentLoading"
                @pay="callPayment({ playerId: username })"
              />
              <q-list separator v-if="partnerStats.length">
                <q-item
                  v-for="(row, idx) in partnerStats"
                  :key="row.username"
                  :class="row.winRate >= 50 ? 'bg-green-1' : 'bg-red-1'"
                >
                  <q-item-section
                    avatar
                    :class="{ 'stats-blur': isPaymentExpired }"
                  >
                    <PlayerAvatar
                      :name="row.name"
                      :username="row.username"
                      :color="getRatingColor(row.rating ?? 1500)"
                      :image-url="row.avatar"
                      :dupr-id="row.duprId"
                      size="32px"
                      :masked="isPaymentExpired"
                      :index="idx"
                    />
                  </q-item-section>
                  <q-item-section
                    class="col"
                    :class="{ 'stats-blur': isPaymentExpired }"
                  >
                    <q-item-label class="text-weight-medium ellipsis">
                      {{
                        isPaymentExpired
                          ? row.name.replace(/./g, '*')
                          : row.name
                      }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side class="text-right">
                    <q-chip
                      :color="row.winRate >= 50 ? 'positive' : 'negative'"
                      text-color="white"
                      size="sm"
                      dense
                      class="q-mb-xs"
                    >
                      {{ row.winRate.toFixed(0) }}%
                    </q-chip>
                    <div class="text-caption">
                      <span class="text-grey-10">{{ row.games }}G</span>
                      <span class="text-green text-weight-bold q-ml-xs"
                        >{{ row.wins }}W</span
                      >
                      <span class="text-red-10 q-ml-xs">{{ row.losses }}L</span>
                      <span
                        class="q-ml-xs"
                        :class="
                          row.avgDiff >= 0
                            ? 'text-green text-weight-bold'
                            : 'text-red-10'
                        "
                      >
                        {{ row.avgDiff >= 0 ? '+' : ''
                        }}{{ row.avgDiff.toFixed(1) }}
                      </span>
                    </div>
                  </q-item-section>
                </q-item>
              </q-list>
              <div v-else class="text-center text-grey q-py-md">
                No partner data available.
              </div>
            </div>

            <div
              v-else-if="activeTab === 'rivals'"
              class="q-pa-md"
              style="max-height: 60vh; overflow-y: auto"
            >
              <PayBanner
                v-if="isPaymentExpired"
                :loading="paymentLoading"
                @pay="callPayment({ playerId: username })"
              />
              <q-list separator v-if="nemesisStats.length">
                <q-item
                  v-for="(row, idx) in nemesisStats"
                  :key="row.username"
                  :class="row.winRate >= 50 ? 'bg-green-1' : 'bg-red-1'"
                >
                  <q-item-section
                    avatar
                    :class="{ 'stats-blur': isPaymentExpired }"
                  >
                    <PlayerAvatar
                      :name="row.name"
                      :username="row.username"
                      :color="getRatingColor(row.rating ?? 1500)"
                      :image-url="row.avatar"
                      :dupr-id="row.duprId"
                      size="32px"
                      :masked="isPaymentExpired"
                      :index="idx"
                    />
                  </q-item-section>
                  <q-item-section
                    class="col"
                    :class="{ 'stats-blur': isPaymentExpired }"
                  >
                    <q-item-label class="text-weight-medium ellipsis">
                      {{
                        isPaymentExpired
                          ? row.name.replace(/./g, '*')
                          : row.name
                      }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side class="text-right">
                    <q-chip
                      :color="row.winRate >= 50 ? 'positive' : 'negative'"
                      text-color="white"
                      size="sm"
                      dense
                      class="q-mb-xs"
                    >
                      {{ row.winRate.toFixed(0) }}%
                    </q-chip>
                    <div class="text-caption">
                      <span class="text-grey-10">{{ row.games }}G</span>
                      <span class="text-green text-weight-bold q-ml-xs"
                        >{{ row.wins }}W</span
                      >
                      <span class="text-red-10 q-ml-xs">{{ row.losses }}L</span>
                      <span
                        class="q-ml-xs"
                        :class="
                          row.avgDiff >= 0
                            ? 'text-green text-weight-bold'
                            : 'text-red-10'
                        "
                      >
                        {{ row.avgDiff >= 0 ? '+' : ''
                        }}{{ row.avgDiff.toFixed(1) }}
                      </span>
                    </div>
                  </q-item-section>
                </q-item>
              </q-list>
              <div v-else class="text-center text-grey q-py-md">
                No rival data available.
              </div>
            </div>

            <div
              v-if="activeTab === 'clutch'"
              class="q-pa-md"
              style="max-height: 60vh; overflow-y: auto"
            >
              <PayBanner
                v-if="isPaymentExpired"
                message="Subscription expired. Renew to view clutch stats."
                :loading="paymentLoading"
                @pay="callPayment({ playerId: username })"
              />
              <div v-if="clutchStats.total > 0">
                <div class="row q-col-gutter-sm q-mb-md">
                  <div class="col-4">
                    <q-card flat bordered class="text-center q-pa-sm">
                      <div class="text-h6 text-weight-bold">
                        {{ clutchStats.total }}
                      </div>
                      <div class="text-caption text-grey-8">Games</div>
                    </q-card>
                  </div>
                  <div class="col-4">
                    <q-card flat bordered class="text-center q-pa-sm">
                      <div
                        class="text-h6 text-weight-bold"
                        :class="
                          clutchStats.winRate >= 50
                            ? 'text-positive'
                            : 'text-negative'
                        "
                      >
                        {{ clutchStats.winRate.toFixed(1) }}%
                      </div>
                      <div class="text-caption text-grey-8">Win Rate</div>
                    </q-card>
                  </div>
                  <div class="col-4">
                    <q-card flat bordered class="text-center q-pa-sm">
                      <div class="text-h6 text-weight-bold text-positive">
                        {{ clutchStats.wins }}
                      </div>
                      <div class="text-caption text-grey-8">Wins</div>
                    </q-card>
                  </div>
                </div>

                <div class="text-subtitle2 text-weight-medium q-mb-sm">
                  Recent Clutch Games
                </div>
                <q-list separator>
                  <q-item
                    v-for="(g, idx) in clutchStats.games.slice(0, 10)"
                    :key="idx"
                    :class="g.won ? 'bg-green-1' : 'bg-red-1'"
                  >
                    <q-item-section>
                      <q-item-label class="text-weight-medium">
                        vs
                        <span :class="{ 'stats-blur': isPaymentExpired }">
                          {{
                            isPaymentExpired
                              ? g.opponents.replace(/./g, '*')
                              : g.opponents
                          }}
                        </span>
                      </q-item-label>
                      <q-item-label caption>
                        <template v-if="!isPaymentExpired">
                          {{
                            g.match.team_a
                              ?.map((p) => p.firstName || p.username || '?')
                              .join(' & ')
                          }}
                        </template>
                        <span
                          v-else
                          :class="{ 'stats-blur': isPaymentExpired }"
                          >{{
                            g.match.team_a
                              ?.map((p) =>
                                (p.firstName || p.username || '?').replace(
                                  /./g,
                                  '*',
                                ),
                              )
                              .join(' & ')
                          }}</span
                        >
                        {{ g.match.team_a_score }} -
                        {{ g.match.team_b_score }}
                        <template v-if="!isPaymentExpired">
                          {{
                            g.match.team_b
                              ?.map((p) => p.firstName || p.username || '?')
                              .join(' & ')
                          }}
                        </template>
                        <span
                          v-else
                          :class="{ 'stats-blur': isPaymentExpired }"
                          >{{
                            g.match.team_b
                              ?.map((p) =>
                                (p.firstName || p.username || '?').replace(
                                  /./g,
                                  '*',
                                ),
                              )
                              .join(' & ')
                          }}</span
                        >
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <q-chip
                        :color="g.won ? 'positive' : 'negative'"
                        text-color="white"
                        size="sm"
                        dense
                      >
                        {{ g.won ? 'W' : 'L' }} ({{ g.myScore }}-{{
                          g.oppScore
                        }})
                      </q-chip>
                    </q-item-section>
                  </q-item>
                </q-list>
              </div>
              <div v-else class="text-center text-grey q-py-md">
                No clutch games yet (tight scores ≤ 2 pts).
              </div>
            </div>
          </q-card>
        </q-dialog>

        <!-- Leaderboard Dialog -->
        <q-dialog v-model="showLeaderboardDialog">
          <q-card style="width: 480px; max-width: 90vw; max-height: 80vh">
            <q-card-section class="row items-center q-pb-none">
              <div class="text-h6">Leaderboard</div>
              <q-space />
              <q-btn icon="close" flat round dense v-close-popup>
                <q-tooltip
                  anchor="top middle"
                  self="bottom middle"
                  :offset="[8, 8]"
                  >Close</q-tooltip
                >
              </q-btn>
            </q-card-section>

            <div class="q-px-md q-pt-md">
              <q-btn-toggle
                v-model="leaderboardTab"
                :options="[
                  {
                    label: 'Global',
                    value: 'global',
                    icon: 'public',
                  },
                  {
                    label: 'From Matches',
                    value: 'matches',
                    icon: 'sports_tennis',
                  },
                ]"
                color="grey-5"
                toggle-color="accent"
                spread
                dense
                size="sm"
                class="full-width"
              />
            </div>

            <q-card-section
              class="q-pa-md"
              style="max-height: 60vh; overflow-y: auto"
            >
              <div v-if="leaderboardLoading" class="flex flex-center q-py-md">
                <q-spinner color="accent" size="32px" />
              </div>
              <q-list separator v-else-if="leaderboardData.length">
                <q-item
                  v-for="(player, idx) in leaderboardData"
                  :key="player.username"
                >
                  <q-item-section avatar>
                    <div class="row items-center no-wrap" style="gap: 8px">
                      <div class="text-h6 text-weight-bold text-grey-5">
                        {{ idx + 1 }}
                      </div>
                      <PlayerAvatar
                        :name="player.firstName"
                        :username="player.username"
                        :color="getRatingColor(player.rating)"
                        :image-url="player.avatar"
                        size="32px"
                      />
                    </div>
                  </q-item-section>
                  <q-item-section>
                    <q-item-label class="text-weight-medium ellipsis">
                      {{ player.firstName || player.username }}
                    </q-item-label>
                    <q-item-label caption class="ellipsis"
                      >@{{ player.username }}</q-item-label
                    >
                  </q-item-section>
                  <q-item-section side>
                    <q-chip
                      :color="getRatingColor(player.rating)"
                      text-color="white"
                      size="sm"
                      class="text-weight-bold"
                    >
                      {{ player.rating }}
                    </q-chip>
                  </q-item-section>
                </q-item>
              </q-list>
              <div v-else class="text-center text-grey q-py-md">
                No data available.
              </div>
            </q-card-section>
          </q-card>
        </q-dialog>

        <!-- Edit Profile Dialog -->
        <q-dialog v-model="showEditProfileDialog" persistent>
          <q-card style="min-width: 320px; max-width: 90vw">
            <q-card-section class="row items-center q-pb-none">
              <div class="text-h6">Edit Profile</div>
              <q-space />
              <q-btn icon="close" flat round dense v-close-popup>
                <q-tooltip
                  anchor="top middle"
                  self="bottom middle"
                  :offset="[8, 8]"
                  >Close</q-tooltip
                >
              </q-btn>
            </q-card-section>

            <q-card-section class="q-pt-md">
              <q-input
                v-model="editFirstName"
                filled
                label="First Name"
                dense
                class="q-mb-sm"
                :rules="[(val) => !!val?.trim() || 'First name is required']"
              />
              <q-banner
                dense
                class="bg-blue-1 text-blue-8 q-mb-sm rounded-borders"
              >
                <div class="text-caption q-mb-xs">
                  DUPR ID is optional — to find it, navigate to
                </div>
                <q-breadcrumbs
                  gutter="xs"
                  class="text-caption text-blue-9 no-wrap"
                  style="font-size: 10px"
                  dense
                >
                  <template v-slot:separator>
                    <q-icon size="0.9em" name="chevron_right" color="blue-9" />
                  </template>
                  <q-breadcrumbs-el
                    class="text-blue-6"
                    label="My DUPR"
                    icon="person"
                  />
                  <q-breadcrumbs-el
                    class="text-blue-6"
                    label="Share"
                    icon="share"
                  />
                  <q-breadcrumbs-el
                    class="text-blue-6"
                    label="Copy DUPR ID"
                    icon="content_copy"
                  />
                </q-breadcrumbs>
              </q-banner>
              <q-input
                v-model="editDuprId"
                filled
                label="DUPR ID"
                dense
                class="q-mb-sm"
              />
              <q-input
                v-model="currentPassword"
                filled
                type="password"
                label="Current Password"
                dense
                class="q-mb-sm"
              />
              <q-input
                v-model="newPassword"
                filled
                type="password"
                label="New Password (optional)"
                dense
                class="q-mb-sm"
                hint="Leave blank to keep current password"
              />
              <q-input
                v-if="newPassword"
                v-model="confirmNewPassword"
                filled
                type="password"
                label="Confirm New Password"
                dense
                :rules="[
                  (val) => val === newPassword || 'Passwords do not match',
                ]"
              />
            </q-card-section>

            <q-card-actions align="right">
              <q-btn flat label="Cancel" color="primary" v-close-popup />
              <q-btn
                flat
                label="Update"
                color="primary"
                :loading="editProfileLoading"
                :disable="isEditProfileDisabled"
                @click="editProfile"
              />
            </q-card-actions>
          </q-card>
        </q-dialog>
      </template>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar, LocalStorage } from 'quasar';
import { useNotify } from 'src/composables/useNotify';
import { likhaClient } from 'src/boot/likha';
import {
  readItems,
  readUsers,
  createItem,
  uploadFiles,
  updateUser,
  updateMe,
} from '@likha-erp/likha-sdk';
import {
  PlayerProfile,
  RatingEvent,
  type DirectusCompletedMatch,
} from 'src/services/playerProfile';
import { useAuth } from 'src/composables/useAuth';
import { usePayment } from 'src/composables/usePayment';
import MatchResult from 'src/components/MatchResult.vue';
import PlayerAvatar from 'src/components/PlayerAvatar.vue';
import PayBanner from 'src/components/PayBanner.vue';
import * as echarts from 'echarts';
import { getRatingColor, getRatingCategory } from 'src/utils/playerHelpers';

const router = useRouter();
const $q = useQuasar();
const { notify } = useNotify();
const { logout, handleAuthError } = useAuth();
const { paymentLoading, fetchPaymentSettings, callPayment } = usePayment();

const firstName = computed(() => PlayerProfile.state.firstName);
const playerRating = computed(() => PlayerProfile.state.rating);
const ratingColor = computed(() => getRatingColor(playerRating.value));
const ratingCategory = computed(() => getRatingCategory(playerRating.value));
const username = computed(() => PlayerProfile.state.username);
const currentUserId = computed(() => PlayerProfile.state.id);
const isPaymentExpired = computed(() => {
  const lastPayment = PlayerProfile.state.lastPayment;
  if (!lastPayment) return false;
  const lastDate = new Date(lastPayment).getTime();
  const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return lastDate < oneMonthAgo;
});

const getRatingGradient = (color: string): string => {
  const gradients: Record<string, string> = {
    'grey-6': 'linear-gradient(135deg, #757575 0%, #9e9e9e 100%)',
    'blue-6': 'linear-gradient(135deg, #1e88e5 0%, #42a5f5 100%)',
    'green-6': 'linear-gradient(135deg, #43a047 0%, #66bb6a 100%)',
    'amber-7': 'linear-gradient(135deg, #ffa000 0%, #ffb74d 100%)',
    'red-7': 'linear-gradient(135deg, #d32f2f 0%, #ef5350 100%)',
  };
  return gradients[color] || gradients['grey-6'];
};

const avatarUrl = computed(() => {
  const avatar = PlayerProfile.state.avatar;
  if (!avatar) return '';
  if (avatar.startsWith('http://') || avatar.startsWith('https://')) {
    return avatar;
  }
  return `https://dink-it.zyberlab.com/assets/${avatar}`;
});

const LAST_CLUB_KEY = 'lastClubId';
const LEADERBOARD_CACHE_KEY = 'leaderboard_cache';
const clubId = ref<string | { clubId: string; name: string }>(
  (LocalStorage.getItem(LAST_CLUB_KEY) as string) || '',
);

const loadLeaderboardCache = () => {
  const cached = LocalStorage.getItem(LEADERBOARD_CACHE_KEY) as
    | {
        global: typeof globalLeaderboard.value;
        matches: typeof matchesLeaderboard.value;
      }
    | string
    | null;
  if (!cached) return false;
  try {
    const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
    if (data?.global) globalLeaderboard.value = data.global;
    if (data?.matches) matchesLeaderboard.value = data.matches;
    return true;
  } catch {
    return false;
  }
};

const saveLeaderboardCache = () => {
  LocalStorage.set(LEADERBOARD_CACHE_KEY, {
    global: globalLeaderboard.value,
    matches: matchesLeaderboard.value,
  });
};
const clubOptions = ref<{ clubId: string; name: string }[]>([]);
const loading = computed(() => PlayerProfile.loading.value);
const avatarInput = ref<HTMLInputElement | null>(null);

const showEditProfileDialog = ref(false);
const editFirstName = ref(firstName.value);
const editDuprId = ref(PlayerProfile.state.duprId || '');
const currentPassword = ref('');
const newPassword = ref('');
const confirmNewPassword = ref('');
const editProfileLoading = ref(false);

watch(firstName, (newVal) => {
  editFirstName.value = newVal;
});

watch(
  () => PlayerProfile.state.duprId,
  (newVal) => {
    editDuprId.value = newVal || '';
  },
);

const isEditProfileDisabled = computed(() => {
  const hasNoFirstName = !editFirstName.value?.trim();
  const hasNoCurrentPassword = !currentPassword.value;
  const passwordTooShort = !!newPassword.value && newPassword.value.length < 8;
  const passwordMismatch =
    !!newPassword.value && newPassword.value !== confirmNewPassword.value;
  return (
    hasNoFirstName ||
    hasNoCurrentPassword ||
    passwordTooShort ||
    passwordMismatch
  );
});

const showCreateClubDialog = ref(false);
const newClubId = ref('');
const newClubName = ref('');
const createClubLoading = ref(false);
const showHistoryDialog = ref(false);
const activeTab = ref<'history' | 'matches' | 'partners' | 'rivals' | 'clutch'>(
  'history',
);

const showLeaderboardDialog = ref(false);
const leaderboardTab = ref<'global' | 'matches'>('global');
const leaderboardLoading = ref(false);
const globalLeaderboard = ref<
  Array<{
    firstName: string;
    lastName: string;
    username: string;
    rating: number;
    avatar?: string;
  }>
>([]);
const matchesLeaderboard = ref<
  Array<{
    firstName: string;
    lastName: string;
    username: string;
    rating: number;
    avatar?: string;
  }>
>([]);

const leaderboardData = computed(() => {
  return leaderboardTab.value === 'global'
    ? globalLeaderboard.value
    : matchesLeaderboard.value;
});

const playerEvents = computed(() => PlayerProfile.state.events || []);

const sortedEvents = computed<RatingEvent[]>(() => {
  return [...playerEvents.value].sort((a, b) => {
    const dateA = new Date(a.day).getTime();
    const dateB = new Date(b.day).getTime();
    return dateB - dateA;
  });
});

const sortedMatches = computed(() => {
  const matches = PlayerProfile.state.completedMatches || [];
  console.log('[PlayerPage] raw completedMatches from state:', matches);
  const sorted = [...matches].sort((a, b) => {
    const dateA = new Date(a.completed_at).getTime();
    const dateB = new Date(b.completed_at).getTime();
    return dateB - dateA;
  });
  console.log('[PlayerPage] sortedMatches count:', sorted.length);
  return sorted;
});

const getMatchRowClass = (match: DirectusCompletedMatch): string => {
  const username = PlayerProfile.state.username;
  const inTeamA = match.team_a?.some(
    (p: { username?: string }) => p.username === username,
  );
  const inTeamB = match.team_b?.some(
    (p: { username?: string }) => p.username === username,
  );
  if (inTeamA) {
    return match.team_a_score >= match.team_b_score ? 'bg-green-1' : 'bg-red-1';
  }
  if (inTeamB) {
    return match.team_b_score >= match.team_a_score ? 'bg-green-1' : 'bg-red-1';
  }
  return '';
};

const matchChartData = computed(() => {
  const username = PlayerProfile.state.username;
  return sortedMatches.value.map((match) => {
    const inTeamA = match.team_a?.some(
      (p: { username?: string }) => p.username === username,
    );
    const inTeamB = match.team_b?.some(
      (p: { username?: string }) => p.username === username,
    );
    let diff = 0;
    let opponents: { firstName?: string; username?: string }[] = [];
    if (inTeamA) {
      diff = match.team_a_score - match.team_b_score;
      opponents = match.team_b || [];
    } else if (inTeamB) {
      diff = match.team_b_score - match.team_a_score;
      opponents = match.team_a || [];
    }
    const teamALabel = (match.team_a || [])
      .map(
        (p: { firstName?: string; username?: string }) =>
          p.firstName || p.username || '?',
      )
      .join(' & ');
    const teamBLabel = (match.team_b || [])
      .map(
        (p: { firstName?: string; username?: string }) =>
          p.firstName || p.username || '?',
      )
      .join(' & ');
    return { diff, opponents, match, teamALabel, teamBLabel };
  });
});

interface SynergyStat {
  username: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  avgDiff: number;
  avatar?: string;
  rating?: number;
  duprId?: string;
}

const partnerStats = computed<SynergyStat[]>(() => {
  const username = PlayerProfile.state.username;
  const map = new Map<
    string,
    {
      name: string;
      games: number;
      wins: number;
      losses: number;
      diffSum: number;
      avatar?: string;
      rating?: number;
      duprId?: string;
    }
  >();

  for (const match of sortedMatches.value) {
    const inTeamA = match.team_a?.some((p) => p.username === username);
    const inTeamB = match.team_b?.some((p) => p.username === username);

    let myTeam: typeof match.team_a = [];
    let myScore = 0;
    let oppScore = 0;

    if (inTeamA) {
      myTeam = match.team_a || [];
      myScore = match.team_a_score;
      oppScore = match.team_b_score;
    } else if (inTeamB) {
      myTeam = match.team_b || [];
      myScore = match.team_b_score;
      oppScore = match.team_a_score;
    } else {
      continue;
    }

    const won = myScore > oppScore;
    const diff = myScore - oppScore;

    for (const p of myTeam) {
      if (p.username === username) continue;
      const existing = map.get(p.username) || {
        name: p.firstName || p.name || p.username || '?',
        games: 0,
        wins: 0,
        losses: 0,
        diffSum: 0,
        avatar: p.avatar,
        rating: p.rating,
        duprId: p.duprId,
      };
      existing.games++;
      if (won) existing.wins++;
      else existing.losses++;
      existing.diffSum += diff;
      map.set(p.username, existing);
    }
  }

  return Array.from(map.entries())
    .map(([uname, data]) => ({
      username: uname,
      name: data.name,
      games: data.games,
      wins: data.wins,
      losses: data.losses,
      winRate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
      avgDiff: data.games > 0 ? data.diffSum / data.games : 0,
      avatar: data.avatar
        ? data.avatar.startsWith('http://') ||
          data.avatar.startsWith('https://')
          ? data.avatar
          : `https://dink-it.zyberlab.com/assets/${data.avatar}`
        : undefined,
      rating: data.rating,
      duprId: data.duprId,
    }))
    .sort((a, b) => b.wins - a.wins || b.games - a.games);
});

const nemesisStats = computed<SynergyStat[]>(() => {
  const username = PlayerProfile.state.username;
  const map = new Map<
    string,
    {
      name: string;
      games: number;
      wins: number;
      losses: number;
      diffSum: number;
      avatar?: string;
      rating?: number;
      duprId?: string;
    }
  >();

  for (const match of sortedMatches.value) {
    const inTeamA = match.team_a?.some((p) => p.username === username);
    const inTeamB = match.team_b?.some((p) => p.username === username);

    let opps: typeof match.team_a = [];
    let myScore = 0;
    let oppScore = 0;

    if (inTeamA) {
      opps = match.team_b || [];
      myScore = match.team_a_score;
      oppScore = match.team_b_score;
    } else if (inTeamB) {
      opps = match.team_a || [];
      myScore = match.team_b_score;
      oppScore = match.team_a_score;
    } else {
      continue;
    }

    const won = myScore > oppScore;
    const diff = myScore - oppScore;

    for (const p of opps) {
      const existing = map.get(p.username) || {
        name: p.firstName || p.name || p.username || '?',
        games: 0,
        wins: 0,
        losses: 0,
        diffSum: 0,
        avatar: p.avatar,
        rating: p.rating,
        duprId: p.duprId,
      };
      existing.games++;
      if (won) existing.wins++;
      else existing.losses++;
      existing.diffSum += diff;
      map.set(p.username, existing);
    }
  }

  return Array.from(map.entries())
    .map(([uname, data]) => ({
      username: uname,
      name: data.name,
      games: data.games,
      wins: data.wins,
      losses: data.losses,
      winRate: data.games > 0 ? (data.wins / data.games) * 100 : 0,
      avgDiff: data.games > 0 ? data.diffSum / data.games : 0,
      avatar: data.avatar
        ? data.avatar.startsWith('http://') ||
          data.avatar.startsWith('https://')
          ? data.avatar
          : `https://dink-it.zyberlab.com/assets/${data.avatar}`
        : undefined,
      rating: data.rating,
      duprId: data.duprId,
    }))
    .sort((a, b) => b.losses - a.losses || b.games - a.games);
});

interface ClutchMatch {
  match: DirectusCompletedMatch;
  myScore: number;
  oppScore: number;
  diff: number;
  won: boolean;
  opponents: string;
}

const clutchStats = computed(() => {
  const username = PlayerProfile.state.username;
  const clutchGames: ClutchMatch[] = [];
  let clutchWins = 0;
  let clutchLosses = 0;

  for (const match of sortedMatches.value) {
    const inTeamA = match.team_a?.some(
      (p: { username?: string }) => p.username === username,
    );
    const inTeamB = match.team_b?.some(
      (p: { username?: string }) => p.username === username,
    );

    let myScore = 0;
    let oppScore = 0;
    let opps: typeof match.team_a = [];

    if (inTeamA) {
      myScore = match.team_a_score;
      oppScore = match.team_b_score;
      opps = match.team_b || [];
    } else if (inTeamB) {
      myScore = match.team_b_score;
      oppScore = match.team_a_score;
      opps = match.team_a || [];
    } else {
      continue;
    }

    const diff = Math.abs(myScore - oppScore);
    if (diff <= 2) {
      const won = myScore > oppScore;
      if (won) clutchWins++;
      else clutchLosses++;

      const opponentNames = opps
        .map(
          (p: { firstName?: string; username?: string }) =>
            p.firstName || p.username || '?',
        )
        .join(' & ');

      clutchGames.push({
        match,
        myScore,
        oppScore,
        diff,
        won,
        opponents: opponentNames,
      });
    }
  }

  const total = clutchWins + clutchLosses;
  return {
    total,
    wins: clutchWins,
    losses: clutchLosses,
    winRate: total > 0 ? (clutchWins / total) * 100 : 0,
    games: clutchGames,
  };
});

const ratingVelocity = computed(() => {
  const events = sortedEvents.value;
  if (events.length < 2) return null;
  const current = events[0]?.rating ?? playerRating.value;
  const oldest = events[events.length - 1]?.rating ?? current;
  const change = current - oldest;
  return { current, oldest, change };
});

const chartRef = ref<HTMLDivElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

const matchesChartRef = ref<HTMLDivElement | null>(null);
let matchesChartInstance: echarts.ECharts | null = null;

const initChart = () => {
  if (!chartRef.value || sortedEvents.value.length === 0) return;

  if (chartInstance) {
    chartInstance.dispose();
    chartInstance = null;
  }

  const fmtDate = (iso: string): string => {
    const d = new Date(iso);
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  };
  const chronological = [...sortedEvents.value].reverse();
  const days = chronological.map((e) => fmtDate(e.day));
  const wins = chronological.map((e) => e.wins);
  const losses = chronological.map((e) => e.losses);
  const ratings = chronological.map((e) => e.rating);

  chartInstance = echarts.init(chartRef.value);
  chartInstance.setOption({
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['Wins', 'Losses', 'Rating'],
      bottom: 0,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { fontSize: 11 },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: days,
      axisLabel: { fontSize: 10 },
    },
    yAxis: [
      {
        type: 'value',
        name: 'W/L',
        position: 'left',
        nameTextStyle: { fontSize: 10 },
      },
      {
        type: 'value',
        name: 'Rating',
        position: 'right',
        nameTextStyle: { fontSize: 10 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Wins',
        type: 'line',
        smooth: true,
        itemStyle: { color: '#21ba45' },
        emphasis: { focus: 'series' },
        data: wins,
      },
      {
        name: 'Losses',
        type: 'line',
        smooth: true,
        itemStyle: { color: '#c10015' },
        emphasis: { focus: 'series' },
        data: losses,
      },
      {
        name: 'Rating',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        itemStyle: { color: '#9f7aea' },
        lineStyle: { width: 3 },
        emphasis: { focus: 'series' },
        data: ratings,
      },
    ],
  });
};

const initMatchesChart = () => {
  if (!matchesChartRef.value || matchChartData.value.length === 0) return;

  if (matchesChartInstance) {
    matchesChartInstance.dispose();
    matchesChartInstance = null;
  }

  const data = [...matchChartData.value].reverse();
  const labels = data.map((d) => {
    const date = new Date(d.match.completed_at);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  });

  matchesChartInstance = echarts.init(matchesChartRef.value);
  matchesChartInstance.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const p = (params as Array<{ dataIndex: number; value: number }>)[0];
        const idx = p.dataIndex;
        const d = data[idx];
        const date = new Date(d.match.completed_at);
        const months = [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ];
        let h = date.getHours();
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        const dateStr = `${months[date.getMonth()]} ${date.getDate()} ${h}:${String(date.getMinutes()).padStart(2, '0')} ${ampm}`;
        return `${dateStr}<br/>${d.match.team_a_score} - ${d.teamALabel}<br/>${d.match.team_b_score} - ${d.teamBLabel}`;
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'Pt Diff',
      nameTextStyle: { fontSize: 10 },
    },
    legend: {
      data: ['Win', 'Loss'],
      bottom: 0,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { fontSize: 11 },
    },
    series: [
      {
        name: 'Win',
        type: 'bar',
        data: data.map((d) => (d.diff >= 0 ? d.diff : null)),
        itemStyle: { color: '#21ba45' },
        barWidth: '60%',
      },
      {
        name: 'Loss',
        type: 'bar',
        data: data.map((d) => (d.diff < 0 ? d.diff : null)),
        itemStyle: { color: '#c10015' },
        barWidth: '60%',
      },
    ],
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '10%',
      containLabel: true,
    },
  });
};

watch([showHistoryDialog, activeTab], ([dialogOpen, tab]) => {
  console.log(
    '[PlayerPage] Dialog:',
    dialogOpen,
    '| Tab:',
    tab,
    '| completedMatches count:',
    PlayerProfile.state.completedMatches?.length ?? 0,
  );
  if (dialogOpen) {
    void fetchPaymentSettings();
  }
  if (dialogOpen && tab === 'history') {
    nextTick(() => initChart());
  } else if (dialogOpen && tab === 'matches') {
    nextTick(() => initMatchesChart());
  } else {
    if (chartInstance) {
      chartInstance.dispose();
      chartInstance = null;
    }
    if (matchesChartInstance) {
      matchesChartInstance.dispose();
      matchesChartInstance = null;
    }
  }
});

const triggerAvatarUpload = () => {
  avatarInput.value?.click();
};

const onAvatarSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !currentUserId.value) return;

  try {
    const formData = new FormData();
    formData.append('file', file);
    const uploadResult = await likhaClient.request(uploadFiles(formData));
    const uploaded = Array.isArray(uploadResult)
      ? uploadResult[0]
      : uploadResult;
    const avatarId = uploaded?.id;

    if (avatarId) {
      await likhaClient.request(
        updateUser(currentUserId.value, { avatar: avatarId }),
      );
      PlayerProfile.state.avatar = avatarId;
      PlayerProfile.saveState();
      notify({ color: 'positive', message: 'Avatar updated!' });
    }
  } catch (err) {
    console.error('Avatar upload failed:', err);
    notify({ color: 'negative', message: 'Failed to upload avatar' });
  } finally {
    input.value = '';
  }
};

const editProfile = async () => {
  if (!currentUserId.value || !editFirstName.value.trim()) return;
  editProfileLoading.value = true;
  try {
    // 1. Verify current password by attempting login
    await likhaClient.login({
      email: PlayerProfile.state.email,
      password: currentPassword.value,
    });

    // 2. Update first name and DUPR ID
    await likhaClient.request(
      updateUser(currentUserId.value, {
        first_name: editFirstName.value.trim(),
        dupr_id: editDuprId.value?.trim() || null,
      } as Record<string, unknown>),
    );
    PlayerProfile.state.firstName = editFirstName.value.trim();
    PlayerProfile.state.duprId = editDuprId.value?.trim() || '';
    PlayerProfile.saveState();

    // 3. Update password if provided
    if (newPassword.value) {
      await likhaClient.request(updateMe({ password: newPassword.value }));
    }

    notify({ color: 'positive', message: 'Profile updated successfully!' });
    showEditProfileDialog.value = false;
    editFirstName.value = '';
    currentPassword.value = '';
    newPassword.value = '';
    confirmNewPassword.value = '';
  } catch (err) {
    const error = err as { errors?: { message?: string }[] };
    const msg = error?.errors?.[0]?.message?.toLowerCase() || '';
    if (
      msg.includes('credentials') ||
      msg.includes('password') ||
      msg.includes('invalid')
    ) {
      notify({
        color: 'negative',
        message: 'Current password is incorrect',
      });
    } else {
      notify({ color: 'negative', message: 'Failed to update profile' });
    }
    console.error('Profile update failed:', err);
  } finally {
    editProfileLoading.value = false;
  }
};

const createClub = async () => {
  if (
    !newClubId.value.trim() ||
    !newClubName.value.trim() ||
    !currentUserId.value
  )
    return;
  createClubLoading.value = true;
  try {
    await likhaClient.request(
      createItem('club', {
        clubId: newClubId.value.trim(),
        name: newClubName.value.trim(),
        admins: { create: [{ directus_users_id: currentUserId.value }] },
        players: { create: [{ directus_users_id: currentUserId.value }] },
      }),
    );

    const createdId = newClubId.value;
    showCreateClubDialog.value = false;
    newClubId.value = '';
    newClubName.value = '';

    router.push(`/club/${createdId}`);
  } catch (err) {
    console.error('Create club failed:', err);
    const error = err as { errors?: { message?: string }[] };
    const msg = error?.errors?.[0]?.message || 'Failed to create club';
    notify({ color: 'negative', message: msg });
  } finally {
    createClubLoading.value = false;
  }
};

const filterClubs = async (
  val: string,
  update: (callback: () => void) => void,
) => {
  if (!val || val.length < 2) {
    update(() => {
      clubOptions.value = [];
    });
    return;
  }
  try {
    const clubs = await likhaClient.request(
      readItems('club', {
        filter: {
          _or: [{ clubId: { _icontains: val } }, { name: { _icontains: val } }],
        },
        fields: ['clubId', 'name'],
        limit: 10,
      }),
    );
    update(() => {
      clubOptions.value = (clubs || []).map((c: unknown) => {
        const club = c as { clubId: string; name?: string };
        return { clubId: club.clubId, name: club.name || club.clubId };
      });
    });
  } catch (err) {
    console.error('Club search failed:', err);
    update(() => {
      clubOptions.value = [];
    });
  }
};

const joinClub = () => {
  if (!clubId.value) return;
  LocalStorage.set(LAST_CLUB_KEY, clubId.value);
  router.push(`/club/${clubId.value}`);
};

onMounted(async () => {
  // Load from cache instantly (for offline / fast startup)
  if (!PlayerProfile.hasCachedProfile()) {
    PlayerProfile.loading.value = true;
  }

  // Attempt server fetch; silently falls back to cache when offline.
  // A 401 (invalid/expired session) is re-thrown here and triggers logout.
  let fetched = false;
  try {
    fetched = await PlayerProfile.fetchProfile();
  } catch (err) {
    if (await handleAuthError(err, router)) return;
    console.warn('Profile fetch failed:', err);
  }

  if (!fetched && !PlayerProfile.hasCachedProfile()) {
    notify({
      color: 'negative',
      message: 'No cached profile available',
    });
  } else if (!fetched && PlayerProfile.error.value) {
    notify({
      color: 'warning',
      message: PlayerProfile.error.value,
    });
  }

  // Fetch club details if there's a cached clubId to display it in the select
  if (clubId.value) {
    try {
      const clubs = await likhaClient.request(
        readItems('club', {
          filter: { clubId: { _eq: clubId.value } },
          fields: ['clubId', 'name'],
          limit: 1,
        }),
      );
      if (clubs && clubs.length > 0) {
        const club = clubs[0] as { clubId: string; name?: string };
        clubOptions.value = [
          { clubId: club.clubId, name: club.name || club.clubId },
        ];
      }
    } catch (err) {
      // Silently fail - club might not exist or offline
      console.warn('Failed to fetch cached club details:', err);
    }
  }
});

const fetchLeaderboard = async () => {
  if (leaderboardLoading.value) return;

  // 1. Load from cache instantly for offline / fast startup
  const hasCache = loadLeaderboardCache();
  if (!hasCache) {
    leaderboardLoading.value = true;
  }

  try {
    // Global top 10 by current rating
    const globalResult = await likhaClient.request(
      readUsers({
        fields: ['first_name', 'last_name', 'username', 'rating', 'avatar'],
        sort: ['-rating'],
        limit: 10,
        filter: { rating: { _nnull: true } },
      }),
    );

    // From matches: top 10 by event rating (deduplicated by player)
    const eventsResult = await likhaClient.request(
      readItems('event', {
        fields: [
          'player.first_name',
          'player.last_name',
          'player.username',
          'player.rating',
          'player.avatar',
          'rating',
        ],
        sort: ['-rating'],
        limit: 100,
      }),
    );

    const resolveAvatar = (avatar: unknown): string => {
      const a = (avatar as string) || '';
      if (!a) return '';
      if (a.startsWith('http://') || a.startsWith('https://')) return a;
      return `https://dink-it.zyberlab.com/assets/${a}`;
    };

    globalLeaderboard.value = (
      Array.isArray(globalResult) ? globalResult : []
    ).map((u: Record<string, unknown>) => ({
      firstName: (u.first_name as string) || '',
      lastName: (u.last_name as string) || '',
      username: (u.username as string) || '',
      rating: typeof u.rating === 'number' ? u.rating : Number(u.rating) || 0,
      avatar: resolveAvatar(u.avatar),
    }));

    const seen = new Set<string>();
    const matchPlayers: typeof globalLeaderboard.value = [];
    for (const e of Array.isArray(eventsResult) ? eventsResult : []) {
      const evt = e as Record<string, unknown>;
      const p = evt.player as Record<string, unknown> | undefined;
      if (!p) continue;
      const uname = (p.username as string) || '';
      if (seen.has(uname)) continue;
      seen.add(uname);
      matchPlayers.push({
        firstName: (p.first_name as string) || '',
        lastName: (p.last_name as string) || '',
        username: uname,
        rating: typeof p.rating === 'number' ? p.rating : Number(p.rating) || 0,
        avatar: resolveAvatar(p.avatar),
      });
    }
    matchesLeaderboard.value = matchPlayers.slice(0, 10);
    saveLeaderboardCache();
  } catch (err) {
    if (!hasCache) {
      console.error('Failed to fetch leaderboard:', err);
    }
  } finally {
    leaderboardLoading.value = false;
  }
};

watch(showLeaderboardDialog, (open) => {
  if (open) {
    // Load cache instantly for offline / fast display
    loadLeaderboardCache();
    // Always attempt a refresh in background
    fetchLeaderboard();
  }
});

const onLogout = () => {
  $q.dialog({
    title: 'Logout',
    message: 'Are you sure you want to log out?',
    cancel: { label: 'Cancel', flat: true, color: 'primary' },
    ok: { label: 'Logout', unelevated: true, color: 'negative', rounded: true },
    persistent: true,
  }).onOk(async () => {
    await logout(router);
  });
};
</script>

<style scoped>
.player-page {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  min-height: 100vh;
}
.brand-title {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.player-card {
  width: 100%;
  max-width: 450px;
  min-height: 80vh;
  border-radius: 16px;
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow:
    0 10px 25px -5px rgba(0, 0, 0, 0.1),
    0 8px 10px -6px rgba(0, 0, 0, 0.05);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

@media (max-width: 768px) {
  .player-card {
    min-height: 100vh;
    border-radius: 0;
  }
}
.player-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 20px 35px -5px rgba(0, 0, 0, 0.15),
    0 12px 15px -8px rgba(0, 0, 0, 0.08);
}
.rating-chip {
  background: linear-gradient(135deg, #764ba2 0%, #9f7aea 100%) !important;
}
.join-btn {
  background: linear-gradient(135deg, #667eea 0%, #5a67d8 100%) !important;
  color: white;
  font-weight: bold;
}
.edit-btn {
  color: #5a67d8 !important;
  border-color: #5a67d8 !important;
}
.chart-container {
  width: 100%;
  height: 280px;
  margin-bottom: 16px;
}
.history-rating {
  background: linear-gradient(135deg, #764ba2 0%, #9f7aea 100%) !important;
}

.rating-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  min-width: 180px;
}

.rating-badge:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.dupr-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, #1e88e5 0%, #42a5f5 100%);
  box-shadow: 0 2px 8px rgba(30, 136, 229, 0.3);
  min-width: 180px;
}

.stats-blur {
  filter: blur(4px);
  opacity: 0.6;
  user-select: none;
  pointer-events: none;
}

@media (max-width: 768px) {
  .player-page {
    min-height: 100dvh;
    display: flex;
    align-items: center;
  }

  .player-card {
    padding: 16px !important;
  }

  .player-card > .q-card-section {
    padding: 20px 0 !important;
  }

  .player-card > .q-card-actions {
    margin-top: 24px !important;
  }
}
</style>
