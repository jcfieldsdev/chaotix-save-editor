START ORG $1000
; Writes default save data
    moveq   #0,d0
    move.l  d0,(a0)+
    moveq   #9,d1

loc_8BE4C8:
    move.l  d0,(a0)+
    dbf     d1,loc_8BE4C8
    move.l  d0,(a0)+
    moveq   #$17,d1

loc_8BE4D2:
    move.w  #$9EFB,(a0)+
    move.w  #0,(a0)+
    move.w  #1,(a0)+
    dbf     d1,loc_8BE4D2
    moveq   #$F,d1

loc_8BE4E4:
    move.l  d0,(a0)+
    dbf     d1,loc_8BE4E4
    movem.l (sp)+,d0/a0

; Calculates and verifies checksum
sub_8BE37C:
    movea.l (a0)+,a1
    move.w  #$4B52,d0
    move.w  #$FB,d1

loc_8BE386:
    add.b   (a0)+,d0
    addx.w  d1,d0
    dbf     d1,loc_8BE386
    cmp.w   a1,d0
    rts

    SIMHALT

    END    START
