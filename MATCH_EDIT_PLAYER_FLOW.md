# Match Edit Player Flow Documentation

## Overview
When players are changed in a match (removed or replaced), the system handles queue management automatically to maintain fairness and proper player flow.

## What Happens to Changed Players

### 1. **Players Removed from Match**
When a player is removed from a match, they are automatically returned to the queue with the following characteristics:

- **Priority**: Set to `'returned'` to indicate they came from a match
- **Queue Position**: Determined by the configured queue return method:
  - **Fairness First**: Added to front of queue (maintains fairness)
  - **End of Queue**: Added to end of queue
  - **Smart Position**: Calculated based on games played and fairness
- **Visual Indicators**: 
  - Orange "Returned" chip in queue
  - "Returned from match" label
- **Timestamps**: 
  - `originalQueueTime`: Set to current time
  - `lastMatchTime`: Set to current time

### 2. **Players Added to Match**
When a player is added to a match, they are automatically removed from the queue:

- **Queue Removal**: Player is removed from queue (they're now in the match)
- **No Special Handling**: No additional processing needed

### 3. **Queue Management Logic**

#### Before Match Edit:
```
Original Match: [Player A, Player B, Player C, Player D]
Queue: [Player E, Player F, Player G]
```

#### After Match Edit (Player C removed, Player E added):
```
Updated Match: [Player A, Player B, Player D, Player E]
Queue: [Player F, Player G, Player C (returned)]
```

#### Processing Steps:
1. **Compare**: Original match vs updated match
2. **Identify Changes**: 
   - Removed players: Players in original but not in updated
   - Added players: Players in updated but not in original
3. **Update Queue**:
   - Remove added players from queue
   - Add removed players back to queue with priority
4. **Apply Settings**:
   - Use configured queue return method
   - Apply auto-sort if enabled
   - Save changes to storage

### 4. **User Feedback**

#### Success Notification:
- Basic: "Match updated successfully!"
- With changes: "Match updated successfully! (2 player(s) returned to queue, 1 player(s) removed from queue)"

#### Visual Indicators:
- **In Queue**: Orange "Returned" chip for players returned from matches
- **In Match Edit**: Clear indication of match type (Singles/Doubles)
- **Validation**: Disabled buttons when at minimum players

### 5. **Edge Cases Handled**

#### Duplicate Prevention:
- Players already in queue are not added again
- Console logging shows skipped duplicates

#### Minimum Player Validation:
- Singles: Cannot remove if only 2 players remain
- Doubles: Cannot remove if only 4 players remain
- Clear error messages for invalid operations

#### Queue Return Methods:
- **Fairness First**: Maintains queue fairness by putting returned players at front
- **End of Queue**: Simple FIFO approach
- **Smart Position**: Calculates optimal position based on games played

### 6. **Technical Implementation**

#### Key Functions:
- `updateQueueAfterEdit()`: Handles queue updates
- `executeQueueReturn()`: Applies queue return method
- `sortQueueByFairness()`: Sorts queue by fairness if enabled

#### Data Flow:
1. Store original match before editing
2. Update match with new players
3. Compare original vs updated
4. Update queue accordingly
5. Apply queue return settings
6. Save all changes
7. Show user feedback

#### Console Logging:
- Detailed analysis of changes
- Player movements tracked
- Queue updates logged

## Benefits

1. **Fairness**: Returned players get appropriate priority
2. **Transparency**: Clear visual indicators of player status
3. **Flexibility**: Configurable queue return methods
4. **User Experience**: Detailed feedback on changes
5. **Data Integrity**: Proper queue management prevents duplicates
6. **Mobile Responsive**: Optimized dialog experience on all devices
7. **Consistent UI**: All dialogs use premium styling and behavior

## Configuration Options

Users can configure how returned players are handled:
- Queue return method (Fairness First, End of Queue, Smart Position)
- Auto-sort queue by fairness
- Visual indicators for returned players

## Dialog Experience

### Match Edit Dialog Features:
- **Responsive Design**: Maximized on mobile, up to 800px on desktop
- **Sticky Headers**: Dynamic reveal behavior on scroll
- **Height Constraints**: 90vh max-height prevents overflow
- **Consistent Styling**: Premium dialog experience across all devices
- **Mobile Optimized**: Full screen on small devices for better interaction

### Visual Improvements:
- **Queue Count Display**: Professional chip showing available players
- **Consistent Widths**: All dialogs use standardized dimensions
- **Enhanced Scrolling**: Smooth scroll behavior with proper constraints
- **Touch-Friendly**: Optimized for mobile interaction

This ensures the system maintains fairness while providing flexibility for different tournament styles and an excellent user experience across all devices.
